import OpenAI from "openai";
import { UserFacingError } from "./errors";

/**
 * 모델 ID는 환경변수로 바꿀 수 있다.
 *   글: gpt-5-mini — OpenAI 공지상 2026-12-11 지원 종료 예정이라 그 전에 교체 필요 (권장 후속: gpt-5.6-terra)
 *   사진: gpt-image-2.5-sunburst — 이미지 입력(편집) 지원, 지원 종료 예정 없음 (gpt-image-1은 이미 종료)
 */
export const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst";

export const isMockMode = () => process.env.MOCK_LLM === "1";
export const hasApiKey = () => !!process.env.OPENAI_API_KEY;

export function openai(opts: { maxRetries?: number; timeout?: number } = {}) {
  // 기본: 일시적 오류만 1번 재시도 (사용량 한도 보호)
  return new OpenAI({ maxRetries: 1, timeout: 110_000, ...opts });
}

/** OpenAI SDK 오류를 사용자용 한글 메시지로 */
export function friendlyError(e: unknown): string {
  if (e instanceof UserFacingError) return e.message;
  if (e instanceof OpenAI.RateLimitError) {
    // 429는 일시적 사용량 초과이거나, 월 사용 한도(예산) 소진
    return "AI 사용량 한도에 걸렸어요. 1분 뒤 다시 눌러 보고, 계속 안 되면 이번 달 사용 한도를 다 쓴 거예요. 관리자에게 알려 주세요.";
  }
  if (e instanceof OpenAI.AuthenticationError) return "AI 키가 올바르지 않아요. 관리자에게 알려 주세요.";
  if (e instanceof OpenAI.NotFoundError) return "AI 모델을 찾을 수 없어요. 관리자에게 모델 설정을 확인해 달라고 알려 주세요.";
  if (e instanceof OpenAI.BadRequestError && e.code === "moderation_blocked") {
    return "AI가 이 사진은 안전 기준 때문에 바꿀 수 없대요. 다른 사진으로 바꿔서 시도해 주세요.";
  }
  if (e instanceof OpenAI.APIConnectionTimeoutError) return "AI가 사진을 만드는 데 너무 오래 걸렸어요. 잠시 뒤 다시 눌러 주세요.";
  if (e instanceof OpenAI.BadRequestError) return "AI가 이 요청을 처리하지 못했어요. 사진이나 글을 바꿔서 다시 시도해 주세요.";
  if (e instanceof OpenAI.APIError) return "AI 서버와 연결이 잠깐 끊겼어요. 잠시 뒤 다시 눌러 주세요.";
  return "처리 중 문제가 생겼어요. 잠시 뒤 다시 눌러 주세요.";
}
