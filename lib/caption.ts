import type { Template } from "./templates";

export const DISCLOSURE =
  "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

/** 템플릿 기본 CTA (레퍼런스 계정 형식) */
export const DEFAULT_TOP_CTA = "🤤 댓글에 '나도' 남겨주세요!";
export const DEFAULT_BOTTOM_CTA = "💬 레시피 궁금하면 댓글 남겨주세요! 👉";

/**
 * 인스타 캡션 조립.
 *   [맨 윗줄 CTA]        ← 템플릿에서 사용자가 정함
 *   [본문 3문장]          ← AI가 각색
 *   [맨 아랫줄 CTA]       ← 템플릿에서 사용자가 정함
 *   [쿠팡 파트너스 고지]   ← 법에서 요구, 항상 붙음
 */
export function buildCaption(body: string, template: Template): string {
  const top = template.caption.topCta.trim();
  const bottom = template.caption.bottomCta.trim();
  return [top, body.trim(), bottom, DISCLOSURE].filter(Boolean).join("\n\n");
}
