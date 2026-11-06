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

  // 로그인하고 돌아올 때 Supabase가 허용 주소 목록에 없다며 첫 화면(?code=…)으로 보내는 경우가 있다 →
  // 어느 화면으로 오든 code가 있으면 로그인 마무리(/auth/callback)로 넘긴다
  const code = request.nextUrl.searchParams.get("code");
  if (code && request.nextUrl.pathname !== "/auth/callback") {
    const to = request.nextUrl.clone();
    to.pathname = "/auth/callback";
    to.search = "";
    to.searchParams.set("code", code);
    to.searchParams.set("next", request.nextUrl.pathname === "/" ? "/mypage" : request.nextUrl.pathname);
    return NextResponse.redirect(to);
  }

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
