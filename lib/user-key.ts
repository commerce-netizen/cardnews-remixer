import { UserFacingError } from "./errors";
import { hasApiKey, isMockMode } from "./openai";
import { unseal } from "./secret-box";
import { AUTH_ENABLED } from "./supabase/env";
import { currentUser, supabaseAdmin } from "./supabase/server";
import { BlockedError, NeedCodeError, isAdmin, requireMember } from "./members";

export class NeedLoginError extends UserFacingError {}
export class NeedKeyError extends UserFacingError {}

/**
 * 이번 요청에 쓸 OpenAI 키.
 * - 로그인이 켜져 있으면: 로그인한 사람이 마이페이지에 넣은 키 (없으면 안내)
 * - 꺼져 있으면: 예전처럼 서버 환경변수 키
 * - 데모 모드면: 빈 문자열 (AI를 부르지 않음)
 */
export async function requestApiKey(): Promise<string> {
  if (isMockMode()) return "";
  if (!AUTH_ENABLED) {
    if (!hasApiKey()) throw new UserFacingError("AI 키가 설정되지 않았어요. 관리자에게 OPENAI_API_KEY 설정을 요청해 주세요.");
    return process.env.OPENAI_API_KEY!;
  }
  const user = await currentUser();
  if (!user) throw new NeedLoginError("로그인이 필요해요. 오른쪽 위 '로그인'을 눌러 주세요.");
  await requireMember(user);
  const { data } = await supabaseAdmin().from("user_secrets").select("openai_key_enc").eq("user_id", user.id).maybeSingle();
  if (!data?.openai_key_enc) {
    // 관리자는 따로 넣지 않아도 서버에 넣어 둔 운영자 키(OPENAI_API_KEY)를 쓴다
    if (isAdmin(user) && hasApiKey()) return process.env.OPENAI_API_KEY!;
    throw new NeedKeyError("마이페이지에서 내 OpenAI API 키를 먼저 넣어 주세요.");
  }
  try {
    return unseal(data.openai_key_enc);
  } catch {
    throw new NeedKeyError("저장된 키를 읽지 못했어요. 마이페이지에서 OpenAI API 키를 다시 넣어 주세요.");
  }
}

/** 오류 → HTTP 상태 (로그인 필요 401, 키 필요 403) */
export function statusOf(e: unknown, fallback = 502): number {
  if (e instanceof NeedLoginError) return 401;
  if (e instanceof NeedKeyError || e instanceof NeedCodeError || e instanceof BlockedError) return 403;
  return fallback;
}
