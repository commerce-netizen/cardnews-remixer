/**
 * 화면 쪽 양식 도우미 — 조합(썸네일·내지·마지막 장 템플릿 묶음)으로 슬라이드를 만들고 다시 그린다.
 */
import { DEFAULT_ACCENT, roughFields, getLayout, setField, type LayoutKind } from "./magazine";
import { BUILTIN_PAGES, allPages, applyPage, findPage, type PageTemplate } from "./page-templates";
import type { FillRequest, FillResult } from "./fill";
import type { Slide } from "./types";

/** 템플릿(조합)에 저장되는 장 템플릿 묶음 */
export type LayoutSet = {
  /** 썸네일 템플릿 id */
  cover: string;
  /** 내지 템플릿 id들 — 장마다 AI가 이 중 내용에 맞는 것을 고른다. 비우면 기본 제공 내지 전부에서 고름 */
  inners: string[];
  /** 마지막 장 템플릿 id (빈 문자열이면 마지막 장도 내지로) */
  last: string;
  accent: string;
};

export const DEFAULT_SET: LayoutSet = { cover: "cover-photo-bottom", inners: [], last: "last-ask3", accent: DEFAULT_ACCENT };

/** 몇 번째 장이 썸네일·내지·마지막 장인지 (3장 이상일 때만 마지막 장) */
export function kindFor(i: number, n: number): LayoutKind {
  if (i === 0) return "cover";
  if (n >= 3 && i === n - 1) return "last";
  return "inner";
}

const pagesOfKind = (kind: LayoutKind) => BUILTIN_PAGES.filter((p) => p.kind === kind);

/** 이 장에 쓸 수 있는 장 템플릿 후보 */
export function candidatesFor(set: LayoutSet, kind: LayoutKind, pages: PageTemplate[] = allPages()): PageTemplate[] {
  const one = (id: string) => findPage(id, pages);
  if (kind === "cover") return [one(set.cover) ?? pagesOfKind("cover")[0]];
  if (kind === "last") {
    const p = set.last ? one(set.last) : undefined;
    if (p) return [p];
  }
  const chosen = (set.inners ?? []).map(one).filter((p): p is PageTemplate => !!p);
  return chosen.length ? chosen : pagesOfKind("inner");
}

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
  if (!res.ok) throw new Error(data.error || "양식에 글을 넣지 못했어요. 다시 눌러 주세요.");
  return data as FillResult;
}

type Look = { accent: string; handle: string };

/**
 * 한 장을 후보 템플릿 중 하나로 — AI가 (후보가 여럿이면) 고르고 칸에 글을 나눠 쓴다.
 * AI가 실패하면 글을 줄 단위로 첫 후보 칸에 나눠 넣는다.
 */
export async function fillSlide(
  s: Slide,
  cands: PageTemplate[],
  look: Look,
  extra: { context?: string; hasPhoto?: boolean; index?: number },
): Promise<Slide> {
  const layouts = [...new Set(cands.map((p) => p.layout))];
  const text = slideText(s);
  try {
    const r = await requestFill({ layouts, text, original: s.original, ...extra });
    const page = cands.find((p) => p.layout === r.layout) ?? cands[0];
    return applyPage(s, page, r.fields, look);
  } catch (e) {
    if (cands.length === 1 && extra.index === undefined) throw e;
    const page = cands[0];
    const def = getLayout(page.layout);
    return def ? applyPage(s, page, roughFields(def, text || s.original), look) : s;
  }
}

/** 기본 장들을 조합대로 — 장끼리는 동시에 */
export async function magazineSlides(slides: Slide[], set: LayoutSet, handle: string, hasPhoto: (i: number) => boolean): Promise<Slide[]> {
  const n = slides.length;
  const pages = allPages();
  const context = slides.map((s, i) => `[${i + 1}장] ${slideText(s)}`).join("\n");
  const look = { accent: set.accent, handle };
  return Promise.all(
    slides.map((s, i) => fillSlide(s, candidatesFor(set, kindFor(i, n), pages), look, { context, hasPhoto: hasPhoto(i), index: i + 1 })),
  );
}

/** 색·계정 이름만 바뀌었을 때 — AI 없이 저장된 칸 값으로 다시 그린다 */
export function redraw(slide: Slide, look: Look): Slide {
  if (!slide.layout || !slide.fields) return slide;
  const page = findPage(slide.page) ?? findPage(slide.layout);
  return page ? applyPage(slide, page, slide.fields, look) : slide;
}

/** 양식을 빼고 글 상자만 남긴 기본 장으로 */
export function dropLayout(slide: Slide): Slide {
  const { page: _pg, layout: _l, fields: _f, photo: _p, shapes: _s, ink: _i, ...rest } = slide;
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
