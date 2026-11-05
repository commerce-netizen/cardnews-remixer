import { DEFAULT_BOTTOM_CTA, DEFAULT_PINNED_COMMENT, DEFAULT_TOP_CTA } from "./caption";
import { DEFAULT_DM_CTA } from "./dm";
import { DEFAULT_BODY, DEFAULT_TITLE, ROLES, styleOf, type BlockStyle, type TextBlock, type TextRole } from "./layout";
import type { FontNeed } from "./webfonts";

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

export const BUILTIN_TEMPLATES: Template[] = [
  { id: "default", name: "기본 디자인", builtin: true, styles: { title: DEFAULT_TITLE, body: DEFAULT_BODY }, ...base },
  {
    id: "subtitle-black",
    name: "굵은 자막형",
    builtin: true,
    styles: {
      title: { ...DEFAULT_TITLE, fontId: "dohyeon" },
      body: { ...DEFAULT_BODY, fontId: "dohyeon", outline: false, boxColor: "#000000", boxOpacity: 72, boxBorder: false },
    },
    ...base,
    watermark: { ...DEFAULT_WATERMARK_STYLE, opacity: 70 },
  },
  {
    id: "clean-white",
    name: "깔끔한 흰 박스",
    builtin: true,
    styles: {
      title: { ...DEFAULT_TITLE, fontId: "gmarket" },
      body: { ...DEFAULT_BODY, fontId: "gmarket", color: "#1c1c1e", outline: false, boxOpacity: 90, boxBorder: false },
    },
    ...base,
    watermark: { ...DEFAULT_WATERMARK_STYLE, opacity: 65 },
  },
  {
    id: "magazine",
    name: "매거진 명조",
    builtin: true,
    styles: {
      title: { ...DEFAULT_TITLE, fontId: "NanumMyeongjo", weight: 800, size: 88, outline: false, shadow: true, lineHeight: 1.2, letterSpacing: -3 },
      body: {
        ...DEFAULT_BODY, fontId: "MaruBuri", weight: 600, size: 44, color: "#1c1c1e", outline: false, align: "left",
        boxColor: "#ffffff", boxOpacity: 92, boxBorder: false, lineHeight: 1.45, x: 7, w: 86, y: 68, h: 24, boxPad: 36,
      },
      subtitle: { ...DEFAULT_TITLE, fontId: "MaruBuri", weight: 400, size: 36, outline: false, shadow: true, y: 8, h: 8, vAlign: "top" },
    },
    ...base,
    adLabel: false,
  },
  {
    id: "news",
    name: "뉴스 헤드라인",
    builtin: true,
    styles: {
      title: {
        ...DEFAULT_TITLE, fontId: "Paperlogy", weight: 800, size: 80, outline: false, shadow: false, x: 0, w: 100, y: 64, h: 30,
        box: true, boxColor: "#0b1f44", boxOpacity: 92, boxPad: 60, lineHeight: 1.22, letterSpacing: -2, accentColor: "#ffd400",
      },
      body: {
        ...DEFAULT_BODY, fontId: "Pretendard", weight: 600, size: 46, color: "#111111", outline: false, align: "left",
        x: 0, w: 100, y: 70, h: 30, boxColor: "#ffffff", boxOpacity: 96, boxBorder: false, boxPad: 60, lineHeight: 1.45,
        accentColor: "#d92d20",
      },
      label: { ...DEFAULT_TITLE, fontId: "Pretendard", weight: 800, size: 32, color: "#ffffff", outline: false, shadow: false,
        x: 5.5, y: 6, w: 30, h: 5, box: true, boxColor: "#d92d20", boxOpacity: 100, boxPad: 14, vAlign: "middle", align: "center" },
    },
    ...base,
    adLabel: false,
    watermark: { ...DEFAULT_WATERMARK_STYLE, pos: "top-left", opacity: 85 },
  },
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
