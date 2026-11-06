/**
 * 화면 쪽 매거진 레이아웃 도우미 — 템플릿의 레이아웃 세트(표지·속지·마지막 장)로 슬라이드를 만들고 다시 그린다.
 */
import { slideHeight } from "./layout";
import { DEFAULT_ACCENT, getLayout, layoutsOf, roughFields, setField, type Fields, type LayoutKind } from "./magazine";
import type { FillRequest, FillResult } from "./fill";
import type { Slide } from "./types";

/** 템플릿에 저장되는 레이아웃 세트 */
export type LayoutSet = {
  cover: string;
  /** 레이아웃 id, 또는 "auto" = 장마다 AI가 내용에 맞는 속지를 고름 */
  inner: string;
  last: string;
  accent: string;
};
export const AUTO = "auto";

export const DEFAULT_SET: LayoutSet = { cover: "cover-photo-bottom", inner: AUTO, last: "last-ask3", accent: DEFAULT_ACCENT };

/** 몇 번째 장이 표지·속지·마지막 장인지 (3장 이상일 때만 마지막 장 양식) */
export function kindFor(i: number, n: number): LayoutKind {
  if (i === 0) return "cover";
  if (n >= 3 && i === n - 1) return "last";
  return "inner";
}

export function candidatesFor(set: LayoutSet, kind: LayoutKind): string[] {
  const id = set[kind];
  if (id && id !== AUTO && getLayout(id)) return [id];
  return layoutsOf(kind).map((l) => l.id);
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

/** 레이아웃 + 칸 값으로 슬라이드를 그린다 (사진·원본 글은 그대로 둔다) */
export function applyLayout(slide: Slide, id: string, fields: Fields, look: Look): Slide {
  const def = getLayout(id);
  if (!def) return slide;
  const built = def.build(fields, { H: slideHeight(slide.ratio), accent: look.accent || DEFAULT_ACCENT, handle: look.handle || "@my_account" });
  return { ...slide, layout: id, fields, bg: built.bg, ink: built.ink, photo: built.photo, shapes: built.shapes, blocks: built.blocks };
}

/** 색·계정 이름만 바뀌었을 때 — AI 없이 저장된 칸 값으로 다시 그린다 */
export function redraw(slide: Slide, look: Look): Slide {
  return slide.layout && slide.fields ? applyLayout(slide, slide.layout, slide.fields, look) : slide;
}

/** 레이아웃을 빼고 글 상자만 남긴 기본 장으로 */
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

/** 템플릿 화면 미리보기용 보기 슬라이드 */
export function sampleLayoutSlide(id: string, look: Look): Slide {
  const def = getLayout(id);
  const base: Slide = { image: null, original: "", ratio: 1.25, bg: "", blocks: [] };
  return def ? applyLayout(base, id, def.sample, look) : base;
}

/**
 * 기본 장들을 매거진 레이아웃 장으로 — 장마다 AI가 양식을 고르고(속지 '자동') 칸에 글을 나눠 쓴다. 장끼리는 동시에.
 * AI가 실패한 장은 글을 줄 단위로 칸에 나눠 넣는다.
 */
export async function magazineSlides(slides: Slide[], set: LayoutSet, handle: string, hasPhoto: (i: number) => boolean): Promise<Slide[]> {
  const n = slides.length;
  const context = slides.map((s, i) => `[${i + 1}장] ${slideText(s)}`).join("\n");
  const look = { accent: set.accent, handle };
  return Promise.all(
    slides.map(async (s, i) => {
      const layouts = candidatesFor(set, kindFor(i, n));
      const text = slideText(s);
      try {
        const r = await requestFill({ layouts, text, original: s.original, context, hasPhoto: hasPhoto(i), index: i + 1 });
        return applyLayout(s, r.layout, r.fields, look);
      } catch {
        const id = layouts[0];
        const def = getLayout(id);
        return def ? applyLayout(s, id, roughFields(def, text || s.original), look) : s;
      }
    }),
  );
}
