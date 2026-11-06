/**
 * 화면 쪽 템플릿 조합 도우미 — 1번 장은 썸네일, 나머지는 내지(AI가 칸에 맞게 글을 나눔), 맨 끝에 마지막 장(고정 글).
 */
import { getLayout, roughFields, setField } from "./magazine";
import { applyPage, lastSlide, type Combo, type PageSpec } from "./page-templates";
import type { FillRequest, FillResult } from "./fill";
import type { Slide } from "./types";

/** 장 안의 글 전부 (칸 채우기 재료) */
export function slideText(s: Slide): string {
  return s.blocks
    .filter((b) => b.role !== "handle" && b.text !== "팔로우" && b.text !== "새 글 알림 받기")
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join("\n");
}

export async function requestFill(req: FillRequest): Promise<FillResult> {
  const res = await fetch("/api/fill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "템플릿에 글을 넣지 못했어요. 다시 눌러 주세요.");
  return data as FillResult;
}

type Look = { accent: string; handle: string };

/** 한 장을 이 양식으로 — AI가 칸에 글을 나눠 쓴다. 실패하면 strict면 오류, 아니면 줄 단위로 나눠 넣는다 */
export async function fillSlide(
  s: Slide,
  spec: PageSpec,
  look: Look,
  extra: { context?: string; hasPhoto?: boolean; index?: number },
  strict = false,
): Promise<Slide> {
  const text = slideText(s);
  try {
    const r = await requestFill({ layouts: [spec.layout], text, original: s.original, ...extra });
    return applyPage(s, spec, r.fields, look);
  } catch (e) {
    if (strict) throw e;
    const def = getLayout(spec.layout);
    return def ? applyPage(s, spec, roughFields(def, text || s.original), look) : s;
  }
}

/** 기본 장들을 조합대로 (장끼리는 동시에) + 맨 끝에 마지막 장 */
export async function comboSlides(slides: Slide[], combo: Combo, handle: string, hasPhoto: (i: number) => boolean): Promise<Slide[]> {
  const content = slides.filter((s) => !s.fixedLast);
  const context = content.map((s, i) => `[${i + 1}장] ${slideText(s)}`).join("\n");
  const look = { accent: combo.accent, handle };
  const built = await Promise.all(
    content.map((s, i) => fillSlide(s, i === 0 ? combo.cover : combo.inner, look, { context, hasPhoto: hasPhoto(i), index: i + 1 })),
  );
  return combo.last ? [...built, lastSlide(combo.last, look)] : built;
}

/** 색·계정 이름만 바뀌었을 때 — AI 없이 저장된 칸 값으로 다시 그린다 */
export function redraw(slide: Slide, spec: PageSpec | undefined, look: Look): Slide {
  if (!slide.layout || !slide.fields) return slide;
  const s = applyPage(slide, spec && spec.layout === slide.layout ? spec : { layout: slide.layout }, slide.fields, look);
  return slide.fixedLast && !slide.image ? { ...s, photo: null } : s;
}

/** 양식을 빼고 글 상자만 남긴 기본 장으로 */
export function dropLayout(slide: Slide): Slide {
  const { layout: _l, fields: _f, photo: _p, shapes: _s, ink: _i, ...rest } = slide;
  return { ...rest, bg: "" };
}

/** 글 상자의 글을 고치면 칸 값도 같이 고친다 (나중에 색만 바꿔 다시 그려도 고친 글이 남게) */
export function syncField(slide: Slide, blockId: string, text: string): Slide {
  const b = slide.blocks.find((x) => x.id === blockId);
  if (!b?.field || !slide.fields) return slide;
  let v = text;
  if (b.fieldPre && v.startsWith(b.fieldPre)) v = v.slice(b.fieldPre.length);
  if (b.fieldPost && v.endsWith(b.fieldPost)) v = v.slice(0, -b.fieldPost.length);
  return { ...slide, fields: setField(slide.fields, b.field, v) };
}
