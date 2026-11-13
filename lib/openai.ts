import { AsyncLocalStorage } from "node:async_hooks";
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

/**
 * 요청마다 쓸 OpenAI 키 — 로그인을 켜면 그 사용자가 마이페이지에 넣은 키로 돈다.
 * (글·사진 만드는 규칙과 모델은 서버에 고정이라 누가 써도 품질은 같고, 비용만 각자 키로 나간다)
 */
const keyStore = new AsyncLocalStorage<string>();
export function withApiKey<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return keyStore.run(key, fn);
}

export function openai(opts: { maxRetries?: number; timeout?: number } = {}) {
  // 기본: 일시적 오류·분당 한도(429)는 2번까지 재시도 — SDK가 OpenAI가 알려 준 대기 시간(retry-after)만큼 쉬었다 다시 보낸다
  const apiKey = keyStore.getStore();
  return new OpenAI({ maxRetries: 2, timeout: 110_000, ...(apiKey ? { apiKey } : {}), ...opts });
}

/**
 * 429는 두 종류라 해결법이 다르다.
 *   insufficient_quota — 충전 잔액이 바닥났거나 월 사용 한도(Limits)에 닿음 → 기다려도 안 풀림, 충전·한도 올리기
 *   rate_limit_exceeded — 1분 동안 너무 많이 보냄(계정 등급이 낮을수록 빡빡) → 잠깐 쉬면 풀림
 */
export function isQuotaError(e: unknown): boolean {
  return e instanceof OpenAI.RateLimitError && (e.code === "insufficient_quota" || /quota|billing/i.test(e.message));
}

/** 브라우저에 돌려줄 HTTP 상태 — 402=잔액·월 한도(재시도 무의미), 429=분당 한도(잠시 뒤 재시도) */
export function errorStatus(e: unknown, fallback = 502): number {
  if (e instanceof OpenAI.RateLimitError) return isQuotaError(e) ? 402 : 429;
  return fallback;
}

/** OpenAI SDK 오류를 사용자용 한글 메시지로 */
export function friendlyError(e: unknown): string {
  if (e instanceof UserFacingError) return e.message;
  if (isQuotaError(e)) {
    return "OpenAI 충전 잔액이 바닥났거나 이번 달 사용 한도에 닿았어요. platform.openai.com → Billing에서 충전하거나, Limits에서 월 한도를 올린 뒤 다시 눌러 주세요.";
  }
  if (e instanceof OpenAI.RateLimitError) {
    return "AI에 요청이 한꺼번에 몰려서 잠깐 막혔어요(1분당 한도). 1분 뒤 다시 눌러 주세요.";
  }
  if (e instanceof OpenAI.AuthenticationError) return "AI 키가 올바르지 않아요. 마이페이지에서 OpenAI API 키를 다시 넣어 주세요.";
  if (e instanceof OpenAI.NotFoundError) return "AI 모델을 찾을 수 없어요. 관리자에게 모델 설정을 확인해 달라고 알려 주세요.";
  if (e instanceof OpenAI.BadRequestError && e.code === "moderation_blocked") {
    return "AI가 이 사진은 안전 기준 때문에 바꿀 수 없대요. 다른 사진으로 바꿔서 시도해 주세요.";
  }
  if (e instanceof OpenAI.APIConnectionTimeoutError) return "AI가 사진을 만드는 데 너무 오래 걸렸어요. 잠시 뒤 다시 눌러 주세요.";
  if (e instanceof OpenAI.BadRequestError) return "AI가 이 요청을 처리하지 못했어요. 사진이나 글을 바꿔서 다시 시도해 주세요.";
  if (e instanceof OpenAI.APIError) return "AI 서버와 연결이 잠깐 끊겼어요. 잠시 뒤 다시 눌러 주세요.";
  return "처리 중 문제가 생겼어요. 잠시 뒤 다시 눌러 주세요.";
}
