/**
 * 슬라이드 = 배경 이미지 한 장 + 그 위에 얹는 '글 상자'들.
 *
 * 글 상자 하나하나가 글꼴·굵기·크기·색·위치(끌어서 이동)·정렬·자간·행간·글상자·테두리·그림자·강조색을
 * 따로 가진다. 템플릿은 이 스타일을 '역할'(제목·본문·부제목…)별로 저장해 두고 한 번에 입힌다.
 *
 * 1번 장에 제목 상자 1개, 2번 장부터 본문 상자 1개로 시작하고, 고른 템플릿 모양(위치 포함)을 입힌다.
 */

export type TextRole = "title" | "subtitle" | "body" | "label" | "number" | "source" | "handle" | "other";
export const ROLES: TextRole[] = ["title", "subtitle", "body", "label", "number", "source", "handle", "other"];

export const ROLE_LABEL: Record<TextRole, string> = {
  title: "제목",
  subtitle: "부제목",
  body: "본문",
  label: "머리말·태그",
  number: "숫자·순서",
  source: "출처·날짜",
  handle: "계정 이름",
  other: "기타 글",
};

/** 원본 글꼴 느낌 → 처음에 쓸 글꼴 (사용자는 500여 개 중 언제든 바꿀 수 있다) */
export const FONT_STYLES = {
  gothic: { id: "Pretendard", desc: "평범하고 깔끔한 고딕 (산돌고딕·애플고딕·노토산스 느낌)" },
  gothic_heavy: { id: "Paperlogy", desc: "아주 두껍고 단단한 제목용 고딕" },
  geometric: { id: "GmarketSans", desc: "각진 기하학적 고딕 (지마켓산스·에스코어드림 느낌)" },
  rounded: { id: "jua", desc: "둥글고 귀여운 굵은 글씨 (배민 주아·한나체 느낌)" },
  chunky: { id: "Jalnan", desc: "통통하고 아주 굵은 광고 제목 (여기어때 잘난체·티몬 몬소리 느낌)" },
  blocky: { id: "BMDOHYEON", desc: "네모반듯하고 꽉 찬 굵은 글씨 (배민 도현·블랙한산스 느낌)" },
  impact: { id: "Aggro", desc: "강한 광고·유튜브 썸네일 글씨 (어그로체 느낌)" },
  serif: { id: "MaruBuri", desc: "명조·바탕 (신문·매거진 본문 느낌)" },
  serif_heavy: { id: "NanumMyeongjo", desc: "굵은 명조 제목 (매거진·시사 헤드라인 느낌)" },
  handwriting: { id: "NanumPen", desc: "펜 손글씨" },
  brush: { id: "NanumBrush", desc: "붓글씨·캘리그라피" },
  retro: { id: "BMEULJIRO", desc: "레트로 간판 글씨 (을지로체·간판체 느낌)" },
} as const;
export type FontStyleKey = keyof typeof FONT_STYLES;
export const FONT_STYLE_KEYS = Object.keys(FONT_STYLES) as FontStyleKey[];

export type Align = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";

/** 글 상자의 모양 (템플릿에 저장되는 부분) */
export type BlockStyle = {
  fontId: string;
  weight: number;
  /** 글자 크기 (슬라이드 폭 1080px 기준 px). 상자를 넘치면 자동으로 줄어든다 */
  size: number;
  color: string;
  align: Align;
  vAlign: VAlign;
  /** 줄 간격 (글자 크기의 배수) */
  lineHeight: number;
  /** 자간 (글자 크기의 1/100 단위, 예: -3 = -0.03em) */
  letterSpacing: number;
  /** 위치·크기: 슬라이드 폭·높이에 대한 % (0~100) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 글 뒤 상자 */
  box: boolean;
  boxColor: string;
  boxOpacity: number;
  boxRadius: number;
  boxBorder: boolean;
  boxBorderColor: string;
  /** 상자 안쪽 여백 px */
  boxPad: number;
  /** 글자 테두리 */
  outline: boolean;
  outlineColor: string;
  outlineWidth: number;
  /** 글자 그림자 */
  shadow: boolean;
  shadowColor: string;
  /** 강조 낱말 색 */
  accentColor: string;
};

export type TextBlock = BlockStyle & {
  id: string;
  role: TextRole;
  /** 원본 글 */
  original: string;
  /** 지금 글 (줄바꿈 포함) */
  text: string;
  /** 다른 색으로 강조할 낱말 (없으면 빈 문자열) */
  accent: string;
  /** 매거진 레이아웃: 이 글이 들어가는 칸 주소 (예: "title", "items.2") */
  field?: string;
  /** 칸 값 앞뒤에 붙인 장식 (번호·따옴표) — 고친 글을 칸 값으로 되돌릴 때 뗀다 */
  fieldPre?: string;
  fieldPost?: string;
  /** 원본에서 이 글 바로 뒤에 깔린 색 — 원본 사진 위에 쓸 때 원래 글씨를 가리는 데 쓴다 */
  behind?: string;
};

export const STYLE_KEYS: (keyof BlockStyle)[] = [
  "fontId", "weight", "size", "color", "align", "vAlign", "lineHeight", "letterSpacing", "x", "y", "w", "h",
  "box", "boxColor", "boxOpacity", "boxRadius", "boxBorder", "boxBorderColor", "boxPad",
  "outline", "outlineColor", "outlineWidth", "shadow", "shadowColor", "accentColor",
];
export const POSITION_KEYS: (keyof BlockStyle)[] = ["x", "y", "w", "h"];

export function styleOf(b: BlockStyle, withPosition = true): Partial<BlockStyle> {
  const out: Partial<BlockStyle> = {};
  for (const k of STYLE_KEYS) {
    if (!withPosition && POSITION_KEYS.includes(k)) continue;
    (out as Record<string, unknown>)[k] = b[k];
  }
  return out;
}

export const SLIDE_W = 1080;
export const slideHeight = (ratio: number) => Math.round(SLIDE_W * ratio);

/** 인스타 피드에서 쓸 수 있는 비율로 맞춘다 (가로 1.91:1 ~ 세로 4:5) */
export function clampRatio(r: number): number {
  if (!Number.isFinite(r) || r <= 0) return 1.25;
  return Math.min(1.25, Math.max(0.5236, r));
}

/** 기본 모양 (예전 기본 디자인: 레퍼런스를 픽셀 측정해 1080×1350에 옮긴 값) */
export const BASE_STYLE: BlockStyle = {
  fontId: "jua",
  weight: 400,
  size: 52,
  color: "#ffffff",
  align: "center",
  vAlign: "middle",
  lineHeight: 1.15,
  letterSpacing: 0,
  x: 10,
  y: 40,
  w: 80,
  h: 20,
  box: false,
  boxColor: "#ffffff",
  boxOpacity: 48,
  boxRadius: 0,
  boxBorder: false,
  boxBorderColor: "#000000",
  boxPad: 28,
  outline: false,
  outlineColor: "#000000",
  outlineWidth: 3,
  shadow: false,
  shadowColor: "#000000",
  accentColor: "#ffe14d",
};

/** 표지 제목: 왼쪽 77px, 바닥 1200px, 84px, 검은 테두리 + 그림자 */
export const DEFAULT_TITLE: BlockStyle = {
  ...BASE_STYLE,
  size: 84,
  align: "left",
  vAlign: "bottom",
  lineHeight: 1.23,
  x: 7.1,
  y: 46,
  w: 85.8,
  h: 42.9,
  outline: true,
  outlineWidth: 4,
  shadow: true,
};

/** 본문: x 169~911, y 953~1211 흰색 48% 반투명 상자 + 1.5px 테두리, 52px 가운데 */
export const DEFAULT_BODY: BlockStyle = {
  ...BASE_STYLE,
  size: 52,
  align: "center",
  vAlign: "middle",
  lineHeight: 1.1,
  x: 15.6,
  y: 70.6,
  w: 68.8,
  h: 19.1,
  box: true,
  boxColor: "#ffffff",
  boxOpacity: 48,
  boxBorder: true,
  boxBorderColor: "#000000",
  outline: true,
  outlineWidth: 3,
};

/** 역할별 처음 모양 (템플릿에 없을 때) */
export function defaultStyleFor(role: TextRole): BlockStyle {
  if (role === "title") return DEFAULT_TITLE;
  if (role === "body") return DEFAULT_BODY;
  return { ...BASE_STYLE, size: role === "subtitle" ? 44 : 32, x: 7, y: 8, w: 86, h: 8, align: "left" };
}

let seq = 0;
export const blockId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newBlock(role: TextRole, text: string, style: Partial<BlockStyle> = {}): TextBlock {
  return { ...defaultStyleFor(role), ...style, id: blockId(), role, original: "", text, accent: "" };
}

/** 16진 색 + 0~100 진하기 → rgba() */
export function rgba(hex: string, opacity: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return `rgba(255,255,255,${opacity / 100})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.min(100, Math.max(0, opacity)) / 100})`;
}
