-- スタジオ（/admin/studio）：オリジナルキャラとショート動画の台本を保存する表。
-- Supabase の SQL Editor に貼り付けて Run する（1回だけ。何度流しても壊れない）。

create table if not exists studio_characters (
  id text primary key,
  name text not null,
  base text not null default '',
  role text not null default '',
  gross text not null default '',
  face_ja text not null default '',
  personality text not null default '',
  movement_ja text not null default '',
  catchphrase text not null default '',
  voice_ja text not null default '',
  voice text not null default '',
  movement text not null default '',
  colors text not null default '',
  design text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists studio_shorts (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  character_id text references studio_characters(id) on delete set null,
  premise text not null default '',
  qa jsonb not null default '[]',
  clips jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 管理画面（サーバーのサービスキー）からだけ読み書きする。お客様の画面からは触れない
alter table studio_characters enable row level security;
alter table studio_shorts enable row level security;
