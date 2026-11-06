/**
 * 장 템플릿 — 썸네일·내지·마지막 장을 하나씩 따로 쓰는 템플릿.
 *
 * 기본 제공 = 양식(lib/magazine.ts) 하나당 하나. 사용자는 기본 제공을 복제해
 * 바탕색·포인트 색·글 상자별 모양(글꼴·크기·색·위치·글상자)을 마음껏 고쳐 '내 템플릿'으로 저장한다.
 * 조합(lib/templates.ts의 set)은 이 장 템플릿들을 골라 묶은 것.
 */
import { slideHeight, type BlockStyle } from "./layout";
import { DEFAULT_ACCENT, LAYOUTS, getLayout, type Fields, type LayoutKind } from "./magazine";
import type { Slide } from "./types";

export type PageTemplate = {
  id: string;
  name: string;
  kind: LayoutKind;
  /** 바탕이 되는 양식 id */
  layout: string;
  builtin?: boolean;
  /** 포인트 색 (없으면 조합의 포인트 색) */
  accent?: string;
  /** 바탕색 (없으면 양식 기본) */
  bg?: string;
  /** 글 상자 이름표(slot)별로 고친 모양 */
  styles?: Record<string, Partial<BlockStyle>>;
};

export const BUILTIN_PAGES: PageTemplate[] = LAYOUTS.map((l) => ({ id: l.id, name: l.name, kind: l.kind, layout: l.id, builtin: true }));

const KEY = "cardnews.pages.v1";

export function loadUserPages(): PageTemplate[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string" && getLayout(p.layout)) : [];
  } catch {
    return [];
  }
}

export function saveUserPages(list: PageTemplate[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.filter((p) => !p.builtin)));
  } catch {}
}

export function allPages(): PageTemplate[] {
  return [...loadUserPages(), ...BUILTIN_PAGES];
}

export function findPage(id: string | undefined, list: PageTemplate[] = allPages()): PageTemplate | undefined {
  return id ? list.find((p) => p.id === id) : undefined;
}

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

/** 장 템플릿 + 칸 값으로 슬라이드를 그린다 (사진·원본 글은 그대로) */
export function applyPage(slide: Slide, page: PageTemplate, fields: Fields, look: Look): Slide {
  const def = getLayout(page.layout);
  if (!def) return slide;
  const built = def.build(fields, {
    H: slideHeight(slide.ratio),
    accent: page.accent || look.accent || DEFAULT_ACCENT,
    handle: look.handle || "@my_account",
  });
  // 바탕색을 밝기가 반대인 색으로 바꿨으면 기본 글자색도 뒤집는다 (어두운 바탕에 검정 글씨가 묻히지 않게)
  const bg = page.bg || built.bg;
  // (사진이 꽉 찬 양식은 글씨가 사진 위에 있으니 뒤집지 않는다)
  const flip = !!page.bg && built.photo !== undefined && isDark(page.bg) === (built.ink === "dark");
  const ink = flip ? (built.ink === "dark" ? "light" : "dark") : built.ink;
  const blocks = built.blocks.map((b) => {
    let x = b;
    if (flip && !b.box && FLIP[b.color.toLowerCase()]) x = { ...x, color: FLIP[b.color.toLowerCase()] };
    const o = b.slot ? page.styles?.[b.slot] : undefined;
    return o ? { ...x, ...o } : x;
  });
  return {
    ...slide,
    page: page.id,
    layout: page.layout,
    fields,
    bg,
    ink,
    photo: built.photo,
    shapes: built.shapes,
    blocks,
  };
}

/** 템플릿 화면 미리보기용 */
export function samplePage(page: PageTemplate, look: Look): Slide {
  const base: Slide = { image: null, original: "", ratio: 1.25, bg: "", blocks: [] };
  const def = getLayout(page.layout);
  return def ? applyPage(base, page, def.sample, look) : base;
}

// ── 즐겨찾기 (조합·장 템플릿 모두, id로) ─────────────────
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
