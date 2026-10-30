import { DEFAULT_BOTTOM_CTA, DEFAULT_PINNED_COMMENT, DEFAULT_TOP_CTA } from "./caption";
import { DEFAULT_DM_CTA } from "./dm";
import { DEFAULT_FONT_ID } from "./webfonts";

/**
 * 디자인 템플릿 — 표지(1번 장)와 내지(2번 장부터)의 글꼴·색·글상자·워터마크를 미리 정해 둔 것.
 * 기본 제공 템플릿 몇 개 + 사용자가 만든 템플릿(이 브라우저에 저장)을 함께 쓴다.
 */

export type Align = "left" | "center" | "right";
export type VPos = "top" | "middle" | "bottom";
export type TextSize = "small" | "normal" | "large";

export type TextStyle = {
  fontId: string;
  /** 글자색 (#rrggbb) */
  color: string;
  /** 글자 둘레 테두리 (사진 위에서도 잘 보이게) */
  outline: boolean;
  size: TextSize;
  align: Align;
  /** 글이 놓이는 위치 */
  pos: VPos;
  /** 글상자 사용 */
  box: boolean;
  boxColor: string;
  /** 글상자 진하기 0~100 */
  boxOpacity: number;
  boxBorder: boolean;
};

export type WatermarkStyle = {
  text: string;
  fontId: string;
  color: string;
  /** 진하기 0~100 */
  opacity: number;
  pos: "bottom" | "bottom-left" | "top-left";
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

export type Template = {
  id: string;
  name: string;
  /** 기본 제공 템플릿은 고치거나 지울 수 없다 (복제해서 쓴다) */
  builtin?: boolean;
  cover: TextStyle;
  body: TextStyle;
  watermark: WatermarkStyle;
  caption: CaptionStyle;
  /** 게시물에 고정해 둘 댓글 (그대로 복사해 쓰는 문구) */
  pinnedComment: string;
  dm: DmStyle;
};

export const DEFAULT_WATERMARK = "맛집도둑";

export const SIZE_SCALE: Record<TextSize, number> = { small: 0.85, normal: 1, large: 1.15 };
export const SIZE_LABEL: Record<TextSize, string> = { small: "작게", normal: "보통", large: "크게" };
export const ALIGN_LABEL: Record<Align, string> = { left: "왼쪽", center: "가운데", right: "오른쪽" };
export const VPOS_LABEL: Record<VPos, string> = { top: "위", middle: "가운데", bottom: "아래" };
export const WATERMARK_POS_LABEL: Record<WatermarkStyle["pos"], string> = {
  bottom: "아래 가운데",
  "bottom-left": "아래 왼쪽",
  "top-left": "위 왼쪽",
};

/** 지금까지 쓰던 디자인 (레퍼런스에 맞춘 기본값) */
const DEFAULT_COVER: TextStyle = {
  fontId: DEFAULT_FONT_ID,
  color: "#ffffff",
  outline: true,
  size: "normal",
  align: "left",
  pos: "bottom",
  box: false,
  boxColor: "#ffffff",
  boxOpacity: 48,
  boxBorder: true,
};

const DEFAULT_BODY: TextStyle = {
  fontId: DEFAULT_FONT_ID,
  color: "#ffffff",
  outline: true,
  size: "normal",
  align: "center",
  pos: "bottom",
  box: true,
  boxColor: "#ffffff",
  boxOpacity: 48,
  boxBorder: true,
};

const DEFAULT_WATERMARK_STYLE: WatermarkStyle = {
  text: DEFAULT_WATERMARK,
  fontId: "pretendard",
  color: "#ffffff",
  opacity: 55,
  pos: "bottom",
};

const DEFAULT_CAPTION: CaptionStyle = {
  topCta: DEFAULT_TOP_CTA,
  bottomCta: DEFAULT_BOTTOM_CTA,
};

const DEFAULT_DM: DmStyle = {
  bottomCta: DEFAULT_DM_CTA,
};

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: "default",
    name: "기본 디자인",
    builtin: true,
    cover: DEFAULT_COVER,
    body: DEFAULT_BODY,
    watermark: DEFAULT_WATERMARK_STYLE,
    caption: DEFAULT_CAPTION,
    pinnedComment: DEFAULT_PINNED_COMMENT,
    dm: DEFAULT_DM,
  },
  {
    id: "subtitle-black",
    name: "굵은 자막형",
    builtin: true,
    cover: { ...DEFAULT_COVER, fontId: "dohyeon", outline: true },
    body: {
      ...DEFAULT_BODY,
      fontId: "dohyeon",
      color: "#ffffff",
      outline: false,
      boxColor: "#000000",
      boxOpacity: 72,
      boxBorder: false,
    },
    watermark: { ...DEFAULT_WATERMARK_STYLE, fontId: "pretendard", opacity: 70 },
    caption: DEFAULT_CAPTION,
    pinnedComment: DEFAULT_PINNED_COMMENT,
    dm: DEFAULT_DM,
  },
  {
    id: "clean-white",
    name: "깔끔한 흰 박스",
    builtin: true,
    cover: { ...DEFAULT_COVER, fontId: "gmarket", align: "left" },
    body: {
      ...DEFAULT_BODY,
      fontId: "gmarket",
      color: "#1c1c1e",
      outline: false,
      boxColor: "#ffffff",
      boxOpacity: 90,
      boxBorder: false,
    },
    watermark: { ...DEFAULT_WATERMARK_STYLE, opacity: 65 },
    caption: DEFAULT_CAPTION,
    pinnedComment: DEFAULT_PINNED_COMMENT,
    dm: DEFAULT_DM,
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
    return list.filter(isTemplate).map((t) => ({
      ...t,
      builtin: false,
      caption: { ...DEFAULT_CAPTION, ...t.caption },
      pinnedComment: t.pinnedComment ?? DEFAULT_PINNED_COMMENT,
      dm: { ...DEFAULT_DM, ...t.dm },
    }));
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

/** 이 템플릿이 쓰는 글꼴 목록 (미리 내려받아야 할 것들) */
export function templateFontIds(t: Template): string[] {
  return [t.cover.fontId, t.body.fontId, t.watermark.fontId];
}

function isTemplate(v: unknown): v is Template {
  if (!v || typeof v !== "object") return false;
  const t = v as Partial<Template>;
  return (
    typeof t.id === "string" &&
    typeof t.name === "string" &&
    !!t.cover &&
    !!t.body &&
    !!t.watermark &&
    typeof t.cover.fontId === "string" &&
    typeof t.body.fontId === "string"
  );
}

/** #rrggbb + 0~100 진하기 → rgba() */
export function rgba(hex: string, opacity: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return `rgba(255,255,255,${opacity / 100})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.min(100, Math.max(0, opacity)) / 100})`;
}

/** 밝은 색이면 true — 글자 테두리 색을 반대로 넣어 잘 보이게 한다 */
export function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return true;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}
