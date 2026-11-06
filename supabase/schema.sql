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
