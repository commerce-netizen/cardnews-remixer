import type { User } from "@supabase/supabase-js";
import { UserFacingError } from "./errors";
import { supabaseAdmin } from "./supabase/server";

/**
 * 회원 자격 — 로그인만으로는 못 쓰고, 관리자가 정한 시크릿 코드를 한 번 넣어야 이용할 수 있다.
 * 관리자(ADMIN_EMAILS)는 코드 없이 늘 이용 가능.
 */
export type MemberStatus = "active" | "blocked" | "none";

export class NeedCodeError extends UserFacingError {}
export class BlockedError extends UserFacingError {}

/**
 * 관리자 = ADMIN_EMAILS 에 있는 이메일이면서, 그 이메일이 인증됐고, 구글로 로그인한 적이 있는 계정만.
 * (누가 이메일 가입에 관리자 주소를 적어도 메일 인증·구글 로그인을 못 하면 관리자가 될 수 없다)
 */
export function isAdmin(user: User | null): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!user?.email || !list.includes(user.email.toLowerCase())) return false;
  if (!user.email_confirmed_at) return false;
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider as string];
  return providers.includes("google");
}

export async function memberStatus(user: User): Promise<MemberStatus> {
  if (isAdmin(user)) return "active";
  const { data } = await supabaseAdmin().from("members").select("status").eq("user_id", user.id).maybeSingle();
  return (data?.status as MemberStatus) ?? "none";
}

/** 이용 가능한 회원인지 — 아니면 안내 오류 */
export async function requireMember(user: User): Promise<void> {
  const st = await memberStatus(user);
  if (st === "none") throw new NeedCodeError("마이페이지에서 시크릿 코드를 먼저 넣어 주세요.");
  if (st === "blocked") throw new BlockedError("이용이 중지된 계정이에요. 운영자에게 문의해 주세요.");
}

export const normalizeCode = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");

export async function inviteCode(): Promise<string> {
  const { data } = await supabaseAdmin().from("app_settings").select("invite_code").eq("id", 1).maybeSingle();
  return data?.invite_code ?? "";
}
