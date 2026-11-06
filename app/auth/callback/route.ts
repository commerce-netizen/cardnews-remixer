import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** 구글 로그인·이메일 인증 링크에서 돌아오는 곳 — 로그인을 마치고 원래 가려던 곳으로 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const to = next && next.startsWith("/") && !next.startsWith("//") ? next : "/mypage";
  if (code) {
    const { error } = await (await supabaseServer()).auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("로그인을 마치지 못했어요. 다시 시도해 주세요.")}`, url.origin));
  }
  return NextResponse.redirect(new URL(to, url.origin));
}
