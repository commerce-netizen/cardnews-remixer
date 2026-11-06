/** 로그인(Supabase)이 설정돼 있는지 — 주소·공개 키가 없으면 예전처럼 로그인 없이 돈다 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const AUTH_ENABLED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
