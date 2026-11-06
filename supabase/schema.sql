-- 돈작가 사진 생성기 — Supabase SQL Editor에 통째로 붙여 넣고 Run
-- 두 표 모두 '행 보안(RLS)'만 켜고 정책은 두지 않는다 → 브라우저에서는 절대 못 읽고, 서버(관리자 키)로만 읽고 쓴다.

-- 사용자 OpenAI 키 (암호화된 값 + 끝 4자리)
create table if not exists public.user_secrets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  openai_key_enc text not null,
  key_last4 text not null,
  updated_at timestamptz not null default now()
);
alter table public.user_secrets enable row level security;

-- 내 템플릿·즐겨찾기·지금 쓰는 템플릿 (어느 기기에서 로그인해도 같게)
create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  templates jsonb not null default '[]'::jsonb,
  favorites jsonb not null default '[]'::jsonb,
  active_template text,
  updated_at timestamptz not null default now()
);
alter table public.user_data enable row level security;

-- 회원 (시크릿 코드를 넣고 들어온 사람). status: active = 이용 중, blocked = 관리자가 내보냄
create table if not exists public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  status text not null default 'active' check (status in ('active', 'blocked')),
  joined_at timestamptz not null default now()
);
alter table public.members enable row level security;

-- 사이트 설정 (한 줄) — 시크릿 코드는 관리자 모드에서 바꾼다
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  invite_code text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
insert into public.app_settings (id, invite_code)
values (1, 'DON-' || upper(substr(md5(random()::text), 1, 6)))
on conflict (id) do nothing;
