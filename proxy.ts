import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 로그인 세션을 요청마다 새로 고친다 (Supabase 권장 방식).
 * 로그인이 설정돼 있지 않으면(환경변수 없음) 아무것도 안 한다.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // 정적 파일·이미지·인기 게시물 썸네일은 건너뛴다
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/hot|api/image|.*\\.(?:png|jpg|jpeg|webp|svg|ico|woff2)$).*)"],
};
