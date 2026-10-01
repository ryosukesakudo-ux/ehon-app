-- Supabase の SQL Editor で一度だけ実行する。
-- アプリはサーバー側から service_role キーで読み書きするので、行レベルセキュリティを有効にして
-- 一般公開キー（anon）からは何も読めないようにしておく。

create table if not exists drafts (
  id uuid primary key,
  taste text not null,
  story text not null,
  child_name text not null,
  child_photo_path text,
  mom_photo_path text,
  generation_count int not null default 0,
  photos_deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key,
  draft_id uuid not null references drafts(id),
  size text not null check (size in ('S', 'M', 'L')),
  extra_copy boolean not null default false,
  amount int not null,
  -- pending: 決済前 / paid: 支払い済み・制作中 / generated: 制作完了 / shipped: 発送済み
  status text not null default 'pending' check (status in ('pending', 'paid', 'generated', 'shipped')),
  stripe_session_id text,
  email text,
  phone text,
  shipping jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  generated_at timestamptz,
  shipped_at timestamptz
);

create index if not exists orders_status_idx on orders (status, created_at desc);

alter table drafts enable row level security;
alter table orders enable row level security;

-- プレビュー生成回数の確認と加算を一度に行う
create or replace function claim_generation(p_id uuid, p_max int) returns boolean
language plpgsql as $$
begin
  update drafts set generation_count = generation_count + 1
  where id = p_id and generation_count < p_max;
  return found;
end $$;

revoke execute on function claim_generation(uuid, int) from public, anon, authenticated;

-- 非公開のストレージ（顔写真と生成した絵）
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('books', 'books', false) on conflict do nothing;
