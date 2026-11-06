/**
 * 템플릿 조합 = 썸네일 1 + 내지 1 + 마지막 장 1.
 *
 * 장 하나(PageSpec) = 바탕이 되는 양식(lib/magazine.ts) + 내가 고친 것(바탕색·글 상자별 글꼴/크기/색/위치).
 * 마지막 장은 AI가 쓰지 않고, 템플릿에 적어 둔 글(fields) 그대로 나온다.
 */
import { slideHeight, type BlockStyle } from "./layout";
import { DEFAULT_ACCENT, getLayout, type Fields, type LayoutKind } from "./magazine";
import type { Slide } from "./types";

export type PageSpec = {
  /** 바탕이 되는 양식 id */
  layout: string;
  /** 바탕색 (없으면 양식 기본) */
  bg?: string;
  /** 글 상자 이름표(slot)별로 고친 모양 */
  styles?: Record<string, Partial<BlockStyle>>;
  /** 마지막 장: 늘 이대로 나오는 글 (없으면 양식 보기글) */
  fields?: Fields;
};

export type Combo = {
  cover: PageSpec;
  inner: PageSpec;
  /** 없으면 마지막 장을 붙이지 않는다 */
  last: PageSpec | null;
  /** 포인트 색 (띠·번호·강조) — 세 장 공통 */
  accent: string;
};

export const DEFAULT_COMBO: Combo = {
  cover: { layout: "cover-photo-bottom" },
  inner: { layout: "photo-sub-body" },
  last: { layout: "last-ask3" },
  accent: DEFAULT_ACCENT,
};

type Look = { accent: string; handle: string };

/** 밝은 글자색 ↔ 어두운 글자색 */
const FLIP: Record<string, string> = {
  "#141414": "#ffffff",
  "#6f6f6f": "rgba(255,255,255,0.7)",
  "#444444": "rgba(255,255,255,0.8)",
  "#ffffff": "#141414",
  "rgba(255,255,255,0.85)": "#3a3a3a",
  "rgba(255,255,255,0.9)": "#2a2a2a",
  "rgba(255,255,255,0.75)": "#555555",
  "rgba(255,255,255,0.7)": "#6f6f6f",
  "rgba(255,255,255,0.65)": "#6f6f6f",
};

/** 색이 어두운지 (#rgb·#rrggbb) */
function isDark(hex: string): boolean {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(f.slice(0, 6), 16);
  if (!Number.isFinite(n) || f.length < 6) return false;
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.5;
}

/** 장 하나 + 칸 값으로 슬라이드를 그린다 (사진·원본 글은 그대로) */
export function applyPage(slide: Slide, spec: PageSpec, fields: Fields, look: Look): Slide {
  const def = getLayout(spec.layout);
  if (!def) return slide;
  const built = def.build(fields, {
    H: slideHeight(slide.ratio),
    accent: look.accent || DEFAULT_ACCENT,
    handle: look.handle || "@my_account",
  });
  // 바탕색을 밝기가 반대인 색으로 바꿨으면 기본 글자색도 뒤집는다 (사진이 꽉 찬 양식은 그대로)
  const flip = !!spec.bg && built.photo !== undefined && isDark(spec.bg) === (built.ink === "dark");
  const ink = flip ? (built.ink === "dark" ? "light" : "dark") : built.ink;
  const blocks = built.blocks.map((b) => {
    let x = b;
    if (flip && !b.box && FLIP[b.color.toLowerCase()]) x = { ...x, color: FLIP[b.color.toLowerCase()] };
    const o = b.slot ? spec.styles?.[b.slot] : undefined;
    return o ? { ...x, ...o } : x;
  });
  return {
    ...slide,
    layout: spec.layout,
    fields,
    bg: spec.bg || built.bg,
    ink,
    photo: built.photo,
    shapes: built.shapes,
    blocks,
  };
}

/** 마지막 장 — AI 없이 템플릿에 적어 둔 글 그대로. 사진 칸 없이 바탕색만 */
export function lastSlide(spec: PageSpec, look: Look): Slide {
  const def = getLayout(spec.layout);
  const base: Slide = { image: null, original: "", ratio: 1.25, bg: "", blocks: [], fixedLast: true };
  if (!def) return base;
  return { ...applyPage(base, spec, spec.fields ?? def.sample, look), photo: null };
}

/** 미리보기용 보기 슬라이드 (마지막 장은 적어 둔 글로) */
export function samplePage(spec: PageSpec, look: Look): Slide {
  const def = getLayout(spec.layout);
  const base: Slide = { image: null, original: "", ratio: 1.25, bg: "", blocks: [] };
  if (!def) return base;
  const s = applyPage(base, spec, spec.fields ?? def.sample, look);
  return def.kind === "last" ? { ...s, photo: null } : s;
}

export const kindOfSpec = (spec: PageSpec): LayoutKind | undefined => getLayout(spec.layout)?.kind;

// ── 즐겨찾기 (템플릿·양식 모두, id로) ─────────────────
const FAV_KEY = "cardnews.favorites.v1";

export function loadFavorites(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    return new Set(Array.isArray(v) ? v.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveFavorites(fav: Set<string>): void {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...fav]));
  } catch {}
}

/** 즐겨찾기 먼저, 그다음 원래 순서 */
export function favFirst<T extends { id: string }>(list: T[], fav: Set<string>): T[] {
  return [...list.filter((x) => fav.has(x.id)), ...list.filter((x) => !fav.has(x.id))];
}
