import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { isAdmin } from "./members";
import { AUTH_ENABLED } from "./supabase/env";
import { currentUser } from "./supabase/server";

/** 관리자만 — 아니면 응답(오류)을, 맞으면 사용자를 돌려준다 */
export async function adminOnly(): Promise<User | NextResponse> {
  if (!AUTH_ENABLED) return NextResponse.json({ error: "로그인 기능이 꺼져 있어요." }, { status: 400 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "관리자만 볼 수 있어요." }, { status: 403 });
  return user;
}
