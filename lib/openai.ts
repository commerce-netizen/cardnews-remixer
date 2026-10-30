import OpenAI from "openai";
import { UserFacingError } from "./errors";

/**
 * 모델 ID는 환경변수로 바꿀 수 있다.
 * 기본값 두 모델은 OpenAI에서 지원 종료 예정(deprecated)이라 종료 전에 교체가 필요하다:
 *   gpt-5-mini       → 2026-12-11 종료 예정
 *   gpt-image-1-mini → 2026-12-01 종료 예정
 */
export const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1-mini";

export const isMockMode = () => process.env.MOCK_LLM === "1";
export const hasApiKey = () => !!process.env.OPENAI_API_KEY;

export function openai() {
  // 일시적 오류만 1번 재시도 (사용량 한도 보호)
  return new OpenAI({ maxRetries: 1, timeout: 110_000 });
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
  if (e instanceof OpenAI.BadRequestError) return "AI가 이 요청을 처리하지 못했어요. 사진이나 글을 바꿔서 다시 시도해 주세요.";
  if (e instanceof OpenAI.APIError) return "AI 서버와 연결이 잠깐 끊겼어요. 잠시 뒤 다시 눌러 주세요.";
  return "처리 중 문제가 생겼어요. 잠시 뒤 다시 눌러 주세요.";
}
