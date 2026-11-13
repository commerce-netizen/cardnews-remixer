import { DEFAULT_BOTTOM_CTA, DEFAULT_PINNED_COMMENT, DEFAULT_TOP_CTA } from "./caption";
import { DEFAULT_DM_CTA } from "./dm";
import { DEFAULT_BODY, DEFAULT_TITLE, ROLES, styleOf, type BlockStyle, type TextBlock, type TextRole } from "./layout";
import type { FontNeed } from "./webfonts";
import type { Combo } from "./page-templates";
import { schedulePush } from "./cloud-sync";

/**
 * 디자인 템플릿 — 글 상자의 모양(글꼴·굵기·크기·색·위치·정렬·자간·행간·글상자·테두리·그림자·강조색)을
 * '역할'(제목·본문·부제목·머리말 …)별로 저장해 두고 한 번에 입힌다. 워터마크·캡션 CTA·고정 댓글·DM 문구도 함께.
 * 기본 제공 템플릿 몇 개 + 사용자가 만든 템플릿(이 브라우저에 저장)을 함께 쓴다.
 */

export type WatermarkStyle = {
  text: string;
  fontId: string;
  color: string;
  /** 진하기 0~100 */
  opacity: number;
  pos: "bottom" | "bottom-left" | "top-left";
  /** 글자 크기 px (1080 기준) */
  size: number;
};

/** 인스타 캡션의 맨 윗줄·맨 아랫줄 CTA (가운데 본문은 AI가 각색) */
export type CaptionStyle = {
  topCta: string;
  bottomCta: string;
};

/** 자동 DM에서 사용자가 정하는 부분 (첫 줄은 고정, 가운데 레시피는 AI가 씀) */
export type DmStyle = {
  bottomCta: string;
};

export type TemplateStyles = Partial<Record<TextRole, BlockStyle>> & { title: BlockStyle; body: BlockStyle };

export type Template = {
  id: string;
  name: string;
  /** 기본 제공 템플릿은 고치거나 지울 수 없다 (복제해서 쓴다) */
  builtin?: boolean;
  /** 역할별 글 상자 모양 */
  styles: TemplateStyles;
  watermark: WatermarkStyle;
  /** 오른쪽 위 [광고] 표시 */
  adLabel: boolean;
  caption: CaptionStyle;
  /** 게시물에 고정해 둘 댓글 (그대로 복사해 쓰는 문구) */
  pinnedComment: string;
  dm: DmStyle;
  /**
   * 템플릿 조합 — 썸네일 1 + 내지 1. 있으면 1번 장은 썸네일, 나머지는 내지로 그린다(AI가 칸에 맞게 글을 나눔).
   * 없으면 예전처럼 표지 제목 상자 + 내지 본문 상자. (마지막 장은 없앰 — 예전에 저장된 last 값은 무시)
   */
  combo?: Combo;
};

export const DEFAULT_WATERMARK = "맛집도둑";

export const WATERMARK_POS_LABEL: Record<WatermarkStyle["pos"], string> = {
  bottom: "아래 가운데",
  "bottom-left": "아래 왼쪽",
  "top-left": "위 왼쪽",
};

const DEFAULT_WATERMARK_STYLE: WatermarkStyle = {
  text: DEFAULT_WATERMARK,
  fontId: "pretendard",
  color: "#ffffff",
  opacity: 55,
  pos: "bottom",
  size: 31,
};

const DEFAULT_CAPTION: CaptionStyle = {
  topCta: DEFAULT_TOP_CTA,
  bottomCta: DEFAULT_BOTTOM_CTA,
};

const DEFAULT_DM: DmStyle = {
  bottomCta: DEFAULT_DM_CTA,
};

const base = {
  watermark: DEFAULT_WATERMARK_STYLE,
  adLabel: true,
  caption: DEFAULT_CAPTION,
  pinnedComment: DEFAULT_PINNED_COMMENT,
  dm: DEFAULT_DM,
};

const builtinCombo = (id: string, name: string, combo: Combo): Template => ({
  id,
  name,
  builtin: true,
  styles: { title: DEFAULT_TITLE, body: DEFAULT_BODY },
  ...base,
  watermark: { ...DEFAULT_WATERMARK_STYLE, size: 26, opacity: 70 },
  combo,
});

export const BUILTIN_TEMPLATES: Template[] = [
  { id: "default", name: "기본 디자인", builtin: true, styles: { title: DEFAULT_TITLE, body: DEFAULT_BODY }, ...base },
  builtinCombo("set-classic", "기본 텍스트 박스", {
    cover: { layout: "cover-classic", shade: true }, inner: { layout: "inner-textbox" }, accent: "#e5481c",
  }),
  // ── 인기 카드뉴스 레이아웃 (글 위치·구성으로 나눔, 색은 아무거나 바꿔 써도 됨) ──
  builtinCombo("hot-chip-bottom", "인기 · 말풍선 + 아래 제목", {
    cover: { layout: "cover-chip-bottom" }, inner: { layout: "inner-frame-bottom" }, accent: "#ffe14d",
  }),
  builtinCombo("hot-chip-top", "인기 · 말풍선 + 위 제목", {
    cover: { layout: "cover-chip-top" }, inner: { layout: "inner-frame-top" }, accent: "#ffe14d",
  }),
  builtinCombo("hot-left-recipe", "인기 · 왼쪽 아래 레시피", {
    cover: { layout: "cover-kicker-left" }, inner: { layout: "inner-memo-top" }, accent: "#ffe14d",
  }),
  builtinCombo("hot-left-bold", "인기 · 왼쪽 아래 굵은 세 줄", {
    cover: { layout: "cover-classic", shade: true, styles: { title: { fontId: "Pretendard", weight: 700, size: 78, outline: false, shadow: true } } },
    inner: { layout: "inner-frame-bottom" }, accent: "#ffe14d",
  }),
  builtinCombo("hot-three-accent", "인기 · 세 줄 끝줄 강조", {
    cover: { layout: "cover-three-accent" }, inner: { layout: "inner-plain-center" }, accent: "#a8f25c",
  }),
  builtinCombo("hot-center", "인기 · 한가운데 공지", {
    cover: { layout: "cover-center-big" }, inner: { layout: "inner-frame-center" }, accent: "#ffe14d",
  }),
  builtinCombo("hot-price", "인기 · 특가 가격표", {
    cover: { layout: "cover-price" }, inner: { layout: "inner-frame-bottom" }, accent: "#e5302a",
  }),
  builtinCombo("hot-handwrite", "인기 · 손글씨 후기", {
    cover: { layout: "cover-chip-top", styles: { title: { fontId: "Cafe24Ssurround", weight: 400, outline: false, letterSpacing: -3 } } },
    inner: { layout: "inner-hand-top" }, accent: "#ffe14d",
  }),
  // ── 예전 기본 제공 템플릿 ──
  builtinCombo("set-black", "블랙 무드", {
    cover: { layout: "cover-photo-bottom" }, inner: { layout: "photo-sub-body" }, accent: "#e5481c",
  }),
  builtinCombo("set-info", "정보 정리", {
    cover: { layout: "cover-book" }, inner: { layout: "info-table" }, accent: "#0b4a8f",
  }),
  builtinCombo("set-rank", "랭킹 리스트", {
    cover: { layout: "cover-color-top" }, inner: { layout: "ranking" }, accent: "#2fb79a",
  }),
  builtinCombo("set-photo", "포토 스토리", {
    cover: { layout: "cover-photo-center" }, inner: { layout: "dark-card" }, accent: "#2b6fff",
  }),
];

export const DEFAULT_TEMPLATE = BUILTIN_TEMPLATES[0];

const KEY = "cardnews.templates.v1";
const ACTIVE_KEY = "cardnews.template.active";

/** 내가 만든 템플릿만 (기본 제공 제외) */
export function loadUserTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    // 예전에 저장한 템플릿엔 caption이 없을 수 있어 기본값으로 채운다
    return list.filter(isTemplate).map(migrate);
  } catch {
    return [];
  }
}

export function saveUserTemplates(list: Template[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.filter((t) => !t.builtin)));
  } catch {}
  schedulePush();
}

/** 고를 수 있는 전체 목록 = 기본 제공 + 내가 만든 것 */
export function allTemplates(): Template[] {
  return [...BUILTIN_TEMPLATES, ...loadUserTemplates()];
}

export function loadActiveId(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) || DEFAULT_TEMPLATE.id;
  } catch {
    return DEFAULT_TEMPLATE.id;
  }
}

export function saveActiveId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {}
  schedulePush();
}

export function findTemplate(list: Template[], id: string): Template {
  return list.find((t) => t.id === id) ?? DEFAULT_TEMPLATE;
}

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
}

/** 기존 템플릿을 바탕으로 '내 템플릿' 하나 만들기 */
export function duplicateTemplate(base: Template, name: string): Template {
  return {
    ...structuredClone(base),
    id: newId(),
    name,
    builtin: false,
  };
}

/** 이름 겹치지 않게 "내 디자인 2" 처럼 번호 붙이기 */
export function uniqueName(list: Template[], base: string): string {
  const names = new Set(list.map((t) => t.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) {
    const n = `${base} ${i}`;
    if (!names.has(n)) return n;
  }
}

/** 이 템플릿이 쓰는 글꼴·굵기 (미리 내려받아야 할 것들) */
export function templateFontIds(t: Template): FontNeed[] {
  return [
    ...Object.values(t.styles).filter(Boolean).map((st) => ({ id: st!.fontId, w: st!.weight })),
    ...[t.combo?.cover, t.combo?.inner].flatMap((p) => Object.values(p?.styles ?? {}))
      .filter((st) => st?.fontId)
      .map((st) => ({ id: st!.fontId!, w: st!.weight ?? 400 })),
    t.watermark.fontId,
  ];
}

export function blockFontNeeds(blocks: TextBlock[]): FontNeed[] {
  return blocks.map((b) => ({ id: b.fontId, w: b.weight }));
}

/**
 * 템플릿 모양을 글 상자들에 입힌다. 템플릿에 그 역할 모양이 없으면 그대로 둔다.
 * withPosition=false 면 위치·크기는 그대로 두고 모양만 바꾼다.
 */
export function applyTemplateToBlocks(blocks: TextBlock[], t: Template, withPosition: boolean): TextBlock[] {
  return blocks.map((b) => {
    const st = t.styles[b.role];
    return st ? { ...b, ...styleOf(st, withPosition) } : b;
  });
}

/** 지금 글 상자들의 모양을 역할별로 모아 템플릿 모양으로 (같은 역할이 여럿이면 처음 것) */
export function stylesFromBlocks(blocks: TextBlock[], fallback: TemplateStyles): TemplateStyles {
  const out: Partial<Record<TextRole, BlockStyle>> = {};
  for (const b of blocks) if (!out[b.role]) out[b.role] = styleOf(b) as BlockStyle;
  return { ...fallback, ...out } as TemplateStyles;
}

function isTemplate(v: unknown): v is Template {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return typeof t.id === "string" && typeof t.name === "string" && !!(t.styles || (t.cover && t.body));
}

/** 예전(v1: 표지·내지 두 가지 모양) 템플릿 → 지금 모양 */
type V1Style = {
  fontId: string; color: string; outline: boolean; size: "small" | "normal" | "large"; align: "left" | "center" | "right";
  pos: "top" | "middle" | "bottom"; box: boolean; boxColor: string; boxOpacity: number; boxBorder: boolean;
};
const V1_SCALE = { small: 0.85, normal: 1, large: 1.15 };
function fromV1(st: V1Style, cover: boolean): BlockStyle {
  const d = cover ? DEFAULT_TITLE : DEFAULT_BODY;
  const y = cover
    ? { top: { y: 11.1, vAlign: "top" as const }, middle: { y: 28.6, vAlign: "middle" as const }, bottom: { y: d.y, vAlign: "bottom" as const } }
    : { top: { y: 10.3, vAlign: "middle" as const }, middle: { y: 40.4, vAlign: "middle" as const }, bottom: { y: d.y, vAlign: "middle" as const } };
  return {
    ...d,
    ...y[st.pos ?? "bottom"],
    fontId: st.fontId ?? d.fontId,
    color: st.color ?? d.color,
    outline: !!st.outline,
    shadow: cover && !!st.outline,
    outlineColor: "#000000",
    size: Math.round(d.size * (V1_SCALE[st.size] ?? 1)),
    align: st.align ?? d.align,
    box: !!st.box,
    boxColor: st.boxColor ?? d.boxColor,
    boxOpacity: st.boxOpacity ?? d.boxOpacity,
    boxBorder: !!st.boxBorder,
  };
}

function migrate(raw: Template): Template {
  const t = raw as Template & { cover?: V1Style; body?: V1Style };
  const styles: TemplateStyles = t.styles
    ? { ...t.styles, title: { ...DEFAULT_TITLE, ...t.styles.title }, body: { ...DEFAULT_BODY, ...t.styles.body } }
    : { title: fromV1(t.cover!, true), body: fromV1(t.body!, false) };
  for (const r of ROLES) if (styles[r]) styles[r] = { ...(r === "title" ? DEFAULT_TITLE : DEFAULT_BODY), ...styles[r] };
  return {
    id: t.id,
    name: t.name,
    builtin: false,
    styles,
    watermark: { ...DEFAULT_WATERMARK_STYLE, ...t.watermark },
    adLabel: t.adLabel ?? true,
    caption: { ...DEFAULT_CAPTION, ...t.caption },
    pinnedComment: t.pinnedComment ?? DEFAULT_PINNED_COMMENT,
    dm: { ...DEFAULT_DM, ...t.dm },
    ...(t.combo?.cover && t.combo?.inner ? { combo: { cover: t.combo.cover, inner: t.combo.inner, accent: t.combo.accent } } : {}),
  };
}

export { rgba } from "./layout";

/** 밝은 색이면 true */
export function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return true;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}
