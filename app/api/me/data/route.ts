import { NextResponse } from "next/server";
import { AUTH_ENABLED } from "@/lib/supabase/env";
import { currentUser, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** 내 템플릿·즐겨찾기·지금 쓰는 템플릿 — 로그인하면 어느 기기에서든 같게 */
export async function GET() {
  if (!AUTH_ENABLED) return NextResponse.json({ auth: false });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { data } = await supabaseAdmin().from("user_data").select("templates, favorites, active_template").eq("user_id", user.id).maybeSingle();
  return NextResponse.json({ auth: true, data: data ?? null });
}

export async function PUT(req: Request) {
  if (!AUTH_ENABLED) return NextResponse.json({ ok: true });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { templates?: unknown; favorites?: unknown; active_template?: unknown } | null;
  if (!body || !Array.isArray(body.templates) || !Array.isArray(body.favorites)) {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const size = JSON.stringify(body).length;
  if (size > 2_000_000) return NextResponse.json({ error: "템플릿이 너무 커요." }, { status: 413 });
  const { error } = await supabaseAdmin().from("user_data").upsert({
    user_id: user.id,
    templates: body.templates,
    favorites: body.favorites,
    active_template: typeof body.active_template === "string" ? body.active_template : null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[me/data]", error);
    return NextResponse.json({ error: "저장하지 못했어요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
