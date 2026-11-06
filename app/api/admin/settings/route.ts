import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { adminOnly } from "@/lib/admin-guard";
import { inviteCode, normalizeCode } from "@/lib/members";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const me = await adminOnly();
  if (me instanceof NextResponse) return me;
  return NextResponse.json({ inviteCode: await inviteCode() });
}

/** 시크릿 코드 바꾸기 — { code } 로 직접 정하거나 { regenerate: true } 로 새로 만들기 */
export async function PUT(req: Request) {
  const me = await adminOnly();
  if (me instanceof NextResponse) return me;
  const body = (await req.json().catch(() => null)) as { code?: string; regenerate?: boolean } | null;
  const code = body?.regenerate
    ? `DON-${randomBytes(4).toString("hex").toUpperCase().slice(0, 6)}`
    : normalizeCode(body?.code ?? "");
  if (code.length < 4 || code.length > 40) {
    return NextResponse.json({ error: "코드는 4~40자로 정해 주세요." }, { status: 400 });
  }
  const { error } = await supabaseAdmin().from("app_settings").upsert({ id: 1, invite_code: code, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: "저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ inviteCode: code });
}
