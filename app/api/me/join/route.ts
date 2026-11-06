import { NextResponse } from "next/server";
import { inviteCode, memberStatus, normalizeCode } from "@/lib/members";
import { AUTH_ENABLED } from "@/lib/supabase/env";
import { currentUser, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** 시크릿 코드 넣고 회원 되기 */
export async function POST(req: Request) {
  if (!AUTH_ENABLED) return NextResponse.json({ ok: true });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const st = await memberStatus(user);
  if (st === "active") return NextResponse.json({ ok: true });
  if (st === "blocked") return NextResponse.json({ error: "이용이 중지된 계정이에요. 운영자에게 문의해 주세요." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { code?: string } | null;
  const code = normalizeCode(body?.code ?? "");
  const real = normalizeCode(await inviteCode());
  if (!code || !real || code !== real) {
    // 마구 넣어 보기를 늦춘다
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "시크릿 코드가 맞지 않아요. 받은 코드를 다시 확인해 주세요." }, { status: 400 });
  }
  const { error } = await supabaseAdmin().from("members").upsert({ user_id: user.id, email: user.email, status: "active" });
  if (error) {
    console.error("[me/join]", error);
    return NextResponse.json({ error: "잠시 문제가 생겼어요. 다시 눌러 주세요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
