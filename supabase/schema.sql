-- Supabase の SQL Editor で一度だけ実行する。
-- アプリはサーバー側から service_role キーで読み書きするので、行レベルセキュリティを有効にして
-- 一般公開キー（anon）からは何も読めないようにしておく。ログインの判定だけ公開キーを使う。

create table if not exists drafts (
  id uuid primary key,
  -- 会員の下書きは user_id、登録前のお試しは anon_id（ブラウザのCookie）で持ち主を判定する
  user_id uuid references auth.users(id) on delete cascade,
  anon_id text,
  taste text not null,
  story text not null,
  child_name text not null,
  child_age int check (child_age between 1 and 10),
  child_photo_path text,
  mom_photo_path text,
  dad_photo_path text,
  generation_count int not null default 0,
  photos_deleted_at timestamptz,
  images_deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- 既に作成済みのデータベース向け（パパの写真欄の追加）
alter table drafts add column if not exists dad_photo_path text;
alter table drafts add column if not exists child_age int check (child_age between 1 and 10);

create index if not exists drafts_user_idx on drafts (user_id, created_at desc);
create index if not exists drafts_anon_idx on drafts (anon_id) where user_id is null;

-- 会員が保存している顔写真。最後に使ってから1年で自動削除する。
create table if not exists user_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists user_photos_user_idx on user_photos (user_id, created_at desc);

-- 会員のプレビュー生成の記録（月ごとの上限の判定に使う）
create table if not exists generations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists generations_user_idx on generations (user_id, created_at);

-- 登録前のお試し（ブラウザごと・IPアドレスごとに1回）。IPはハッシュにして保存する。
create table if not exists anon_trials (
  id bigint generated always as identity primary key,
  anon_id text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists anon_trials_anon_idx on anon_trials (anon_id);
create index if not exists anon_trials_ip_idx on anon_trials (ip_hash, created_at);

create table if not exists orders (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  draft_id uuid not null references drafts(id),
  size text not null check (size in ('S', 'M', 'L')),
  extra_copy boolean not null default false,
  amount int not null,
  -- pending: 決済前（コンビニ払いの支払い待ちを含む） / paid: 支払い済み・制作中 / generated: 制作完了 / shipped: 発送済み
  status text not null default 'pending' check (status in ('pending', 'paid', 'generated', 'shipped')),
  stripe_session_id text,
  checkout_completed_at timestamptz,
  email text,
  phone text,
  shipping jsonb,
  -- お届け希望日（null は最短）と時間帯（am / 14-16 / 16-18 / 18-20 / 19-21、null は指定なし）
  delivery_date date,
  delivery_time text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  generated_at timestamptz,
  shipped_at timestamptz
);

-- 既に作成済みのデータベース向け（お届け日時の指定の追加）
alter table orders add column if not exists delivery_date date;
alter table orders add column if not exists delivery_time text;
-- 部数（2026-10-10 追加。extra_copy は以前の「2冊目あり」）
alter table orders add column if not exists copies int not null default 1 check (copies between 1 and 5);

create index if not exists orders_status_idx on orders (status, created_at desc);
create index if not exists orders_user_idx on orders (user_id, created_at desc);

alter table drafts enable row level security;
alter table user_photos enable row level security;
alter table generations enable row level security;
alter table anon_trials enable row level security;
alter table orders enable row level security;

-- 下書きごとのプレビュー回数の確認と加算を一度に行う（登録前のお試し用）
create or replace function claim_generation(p_id uuid, p_max int) returns boolean
language plpgsql as $$
begin
  update drafts set generation_count = generation_count + 1
  where id = p_id and generation_count < p_max;
  return found;
end $$;

create or replace function refund_generation(p_id uuid) returns void
language sql as $$
  update drafts set generation_count = greatest(generation_count - 1, 0) where id = p_id;
$$;

-- 会員の今月（日本時間）のプレビュー枚数を確認し、上限内なら1枚分を記録する。
-- 記録後の残り枚数を返す。上限に達していれば -1。
create or replace function claim_member_generation(p_user uuid, p_draft uuid, p_max int) returns int
language plpgsql as $$
declare
  used int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  select count(*) into used from generations
  where user_id = p_user
    and created_at >= (date_trunc('month', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo');
  if used >= p_max then
    return -1;
  end if;
  insert into generations (user_id, draft_id) values (p_user, p_draft);
  return p_max - used - 1;
end $$;

-- 生成に失敗したときに1枚分を戻す
create or replace function refund_member_generation(p_user uuid, p_draft uuid) returns void
language sql as $$
  delete from generations where id = (
    select id from generations where user_id = p_user and draft_id = p_draft order by id desc limit 1
  );
$$;

-- 登録前のお試しを使えるか確認し、使えるならその場で記録する
create or replace function claim_anon_trial(p_anon text, p_ip text, p_ip_days int) returns boolean
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_ip));
  if exists (
    select 1 from anon_trials
    where anon_id = p_anon or (ip_hash = p_ip and created_at > now() - make_interval(days => p_ip_days))
  ) then
    return false;
  end if;
  insert into anon_trials (anon_id, ip_hash) values (p_anon, p_ip);
  return true;
end $$;

revoke execute on function claim_generation(uuid, int) from public, anon, authenticated;
revoke execute on function refund_generation(uuid) from public, anon, authenticated;
revoke execute on function claim_member_generation(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function refund_member_generation(uuid, uuid) from public, anon, authenticated;
revoke execute on function claim_anon_trial(text, text, int) from public, anon, authenticated;

-- ストレージ：顔写真と生成した絵は非公開、トップページなどの作例だけ公開
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('books', 'books', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('samples', 'samples', true) on conflict do nothing;
