import { NextResponse } from "next/server";
import { adminOnly } from "@/lib/admin-guard";
import { isAdmin } from "@/lib/members";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** 가입한 사람 전부 — 회원 상태·키 등록 여부·가입일·마지막 접속 */
export async function GET() {
  const me = await adminOnly();
  if (me instanceof NextResponse) return me;
  const db = supabaseAdmin();
  const users: { id: string; email?: string; created_at: string; last_sign_in_at?: string | null; app_metadata?: { provider?: string } }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return NextResponse.json({ error: "회원 목록을 못 불러왔어요." }, { status: 500 });
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const [{ data: members }, { data: keys }] = await Promise.all([
    db.from("members").select("user_id, status, joined_at"),
    db.from("user_secrets").select("user_id"),
  ]);
  const m = new Map((members ?? []).map((x) => [x.user_id, x]));
  const k = new Set((keys ?? []).map((x) => x.user_id));
  const list = users
    .map((u) => {
      const admin = isAdmin(u as never);
      return {
        id: u.id,
        email: u.email ?? "",
        provider: u.app_metadata?.provider ?? "email",
        createdAt: u.created_at,
        lastSignIn: u.last_sign_in_at ?? null,
        status: admin ? "admin" : (m.get(u.id)?.status ?? "none"),
        joinedAt: m.get(u.id)?.joined_at ?? null,
        hasKey: k.has(u.id),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ members: list });
}

/** 내보내기(block) · 다시 허용(allow) · 계정 삭제(delete) */
export async function PATCH(req: Request) {
  const me = await adminOnly();
  if (me instanceof NextResponse) return me;
  const body = (await req.json().catch(() => null)) as { userId?: string; action?: string } | null;
  const id = body?.userId;
  if (!id || !["block", "allow", "delete"].includes(body?.action ?? "")) {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  if (id === me.id) return NextResponse.json({ error: "내 계정은 여기서 바꿀 수 없어요." }, { status: 400 });
  const db = supabaseAdmin();
  if (body!.action === "delete") {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) return NextResponse.json({ error: "삭제하지 못했어요." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  const { data: u } = await db.auth.admin.getUserById(id);
  const { error } = await db
    .from("members")
    .upsert({ user_id: id, email: u.user?.email ?? null, status: body!.action === "block" ? "blocked" : "active" });
  if (error) return NextResponse.json({ error: "바꾸지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
