import { createServerClient } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { AUTH_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/** 서버(라우트·서버 컴포넌트)용 — 요청 쿠키의 로그인 정보로 */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // 서버 컴포넌트에서는 쿠키를 못 쓴다 — proxy.ts가 세션을 새로 고친다
        }
      },
    },
  });
}

/** 지금 로그인한 사용자 (로그인이 꺼져 있거나 안 했으면 null) */
export async function currentUser(): Promise<User | null> {
  if (!AUTH_ENABLED) return null;
  const { data } = await (await supabaseServer()).auth.getUser();
  return data.user ?? null;
}

/** 관리자 권한 (서버 전용) — 암호화된 키·사용자 데이터 표는 이걸로만 읽고 쓴다 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 가 없어요.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
