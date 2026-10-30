import type { Template } from "./templates";

/**
 * 댓글 단 사람에게 보내는 자동 DM.
 *
 * 레퍼런스 구조 (고정 틀):
 *   [인트로]              ← 템플릿에서 사용자가 정함
 *   🌶️ 즉석 떡볶이 비법 양념장   ← AI
 *   🍯 물엿 5T …          ← AI (줄마다 이모지, 그중 '✨ 비밀재료'가 딱 한 줄)
 *   🧑‍🍳 만드는 법          ← 고정
 *   1️⃣ … 2️⃣ … (빈 줄로 구분)  ← AI (번호 이모지는 앱이 붙임)
 *   💡 비밀재료 강조 한 줄   ← AI
 *   [하단 버튼 CTA]        ← 템플릿에서 사용자가 정함
 *   *쿠팡파트너스 고지*     ← 고정
 *
 * 핵심: 비밀재료의 **실제 이름은 절대 쓰지 않는다.** 그걸 알려면 링크를 눌러야 하는 게 이 DM의 장치다.
 */

export const DM_DISCLOSURE = "*쿠팡파트너스 활동의 일환으로 일정액의 수수료를 제공받습니다.*";
export const DM_STEPS_HEADING = "🧑‍🍳 만드는 법";

export const DEFAULT_DM_INTRO = "비밀재료는 딱 1개야. 댓글로 요청하신 레시피 드립니다!";
export const DEFAULT_DM_CTA = "👇비밀 재료는 하단 버튼 클릭 후\n<1 or 재료> 검색해주세요!";

/** 단계 번호 이모지 (앱이 붙여 형식을 보장한다) */
const STEP_NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

/** AI가 만드는 부분 */
export type DmContent = {
  /** 이모지로 시작하는 제목 — 예: "🌶️ 즉석 떡볶이 비법 양념장" */
  title: string;
  /** 줄마다 이모지 + 재료 + 분량. 그중 정확히 한 줄이 "✨ 비밀재료 …" */
  ingredients: string[];
  /** 번호 없이 문장만. 앱이 1️⃣2️⃣… 를 붙인다 */
  steps: string[];
  /** 비밀재료를 꼭 넣어야 하는 이유 한 줄 (💡는 앱이 붙임) */
  tip: string;
};

export const EMPTY_DM: DmContent = { title: "", ingredients: [], steps: [], tip: "" };

export function buildDm(dm: DmContent | null | undefined, template: Template): string {
  if (!dm?.title && !dm?.ingredients?.length) return "";
  const intro = template.dm.intro.trim();
  const cta = template.dm.bottomCta.trim();
  const steps = (dm.steps ?? []).map((s, i) => `${STEP_NUMBERS[i] ?? `${i + 1}.`} ${s.trim()}`);
  return [
    intro,
    dm.title.trim(),
    (dm.ingredients ?? []).map((l) => l.trim()).filter(Boolean).join("\n"),
    DM_STEPS_HEADING,
    steps.join("\n\n"),
    dm.tip.trim() ? `💡 ${dm.tip.trim().replace(/^💡\s*/, "")}` : "",
    cta,
    DM_DISCLOSURE,
  ]
    .filter(Boolean)
    .join("\n\n");
}
