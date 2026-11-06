import OpenAI from "openai";
import { NextResponse } from "next/server";
import { seal } from "@/lib/secret-box";
import { AUTH_ENABLED } from "@/lib/supabase/env";
import { currentUser, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** 내 OpenAI 키 상태 (끝 4자리만 — 키 자체는 절대 돌려주지 않는다) */
export async function GET() {
  if (!AUTH_ENABLED) return NextResponse.json({ auth: false });
  const user = await currentUser();
  if (!user) return NextResponse.json({ auth: true, loggedIn: false }, { status: 401 });
  const { data } = await supabaseAdmin().from("user_secrets").select("key_last4, updated_at").eq("user_id", user.id).maybeSingle();
  return NextResponse.json({ auth: true, loggedIn: true, email: user.email, hasKey: !!data, last4: data?.key_last4 ?? null, updatedAt: data?.updated_at ?? null });
}

/** 키 저장 — 먼저 OpenAI에 실제로 붙어 보고(모델 목록 조회, 비용 없음) 맞으면 암호화해서 저장 */
export async function PUT(req: Request) {
  if (!AUTH_ENABLED) return NextResponse.json({ error: "로그인 기능이 꺼져 있어요." }, { status: 400 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { key?: string } | null;
  const key = body?.key?.trim() ?? "";
  if (!/^sk-[A-Za-z0-9_\-]{20,}$/.test(key)) {
    return NextResponse.json({ error: "OpenAI API 키 모양이 아니에요. 'sk-'로 시작하는 키를 통째로 붙여 넣어 주세요." }, { status: 400 });
  }
  try {
    await new OpenAI({ apiKey: key, maxRetries: 0, timeout: 15_000 }).models.list();
  } catch (e) {
    const msg =
      e instanceof OpenAI.AuthenticationError
        ? "이 키로는 OpenAI에 연결이 안 돼요. 키를 다시 확인해 주세요."
        : e instanceof OpenAI.RateLimitError
          ? "키는 맞는데 OpenAI 잔액이나 사용 한도가 부족해요. OpenAI 결제(Billing)에서 충전해 주세요."
          : "OpenAI 연결 확인 중 문제가 생겼어요. 잠시 뒤 다시 눌러 주세요.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const { error } = await supabaseAdmin()
    .from("user_secrets")
    .upsert({ user_id: user.id, openai_key_enc: seal(key), key_last4: key.slice(-4), updated_at: new Date().toISOString() });
  if (error) {
    console.error("[me/key]", error);
    return NextResponse.json({ error: "저장하지 못했어요. 잠시 뒤 다시 눌러 주세요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, last4: key.slice(-4) });
}

export async function DELETE() {
  if (!AUTH_ENABLED) return NextResponse.json({ ok: true });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  await supabaseAdmin().from("user_secrets").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
