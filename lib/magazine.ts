/**
 * 양식(레이아웃) — 썸네일(cover)·내지(inner)·마지막 장(last).
 *
 * 레이아웃 하나 = 칸(field) 목록 + 그 칸들로 슬라이드를 그리는 build().
 * build()는 바탕색·사진 자리·도형(띠·박스·체크칸·프로필)·글 상자들을 만든다.
 * 글 상자는 기존 편집기 그대로 고치고·옮기고·글꼴을 바꿀 수 있다.
 * AI는 장마다 내용을 이 칸들에 나눠 쓴다(/api/fill).
 *
 * 좌표는 1080×1350(4:5) 기준 px로 적고, 슬라이드 높이에 맞춰 세로만 늘이거나 줄인다.
 */
import { BASE_STYLE, DEFAULT_BODY, DEFAULT_TITLE, SLIDE_W, blockId, styleOf, type BlockStyle, type TextBlock, type TextRole } from "./layout";

export type LayoutKind = "cover" | "inner" | "last";
export const KIND_LABEL: Record<LayoutKind, string> = { cover: "썸네일", inner: "내지", last: "마지막 장" };

/** 사진·도형 자리 (슬라이드에 대한 %) */
export type Rect = { x: number; y: number; w: number; h: number };

export type Shape = Rect & {
  /** rect = 색 상자·띠·선, avatar = 동그란 프로필(머리글자) */
  kind?: "rect" | "avatar";
  fill?: string;
  border?: string;
  /** 테두리 두께 px */
  bw?: number;
  /** 모서리 둥글기 px (avatar는 무시) */
  radius?: number;
  /** avatar 안 글자 */
  text?: string;
  /** "shade" = 사진 아래쪽 어둡게 깔리는 그라데이션 (템플릿에서 켜고 끌 수 있다) */
  tag?: "shade";
};

export type Fields = Record<string, string | string[]>;

export type FieldSpec = {
  key: string;
  /** AI에게 주는 설명 */
  desc: string;
  /** 한 칸(목록이면 항목 하나) 최대 글자 수 */
  max: number;
  /** 목록 칸이면 항목 수 */
  count?: number;
};

export type Built = {
  bg: string;
  /** 바탕이 밝으면 dark (워터마크·[광고]를 어두운 글씨로) */
  ink: "light" | "dark";
  /** undefined = 사진 꽉 차게, null = 사진 안 씀 */
  photo?: Rect | null;
  shapes: Shape[];
  blocks: TextBlock[];
};

export type LayoutCtx = { H: number; accent: string; handle: string };

export type LayoutDef = {
  id: string;
  kind: LayoutKind;
  name: string;
  desc: string;
  /** 사진을 쓰는 양식인지 */
  photo: boolean;
  fields: FieldSpec[];
  sample: Fields;
  build: (f: Fields, ctx: LayoutCtx) => Built;
};

// ── 색 ────────────────────────────────────────────────
export const DEFAULT_ACCENT = "#e5481c";
const INK = "#141414";
const MUTED = "#6f6f6f";
const PAPER = "#f7f6f2";
const CHIP = { green: "#c9f0bf", pink: "#f9d1e1", blue: "#c9e7ff", yellow: "#ffef7a", orange: "#ffdcc0" };
const FOLLOW_BLUE = "#0095f6";
export const SHADE_BOTTOM = "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 62%, rgba(0,0,0,0.9) 100%)";
const SHADE_TOP = "linear-gradient(0deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.6) 72%, rgba(0,0,0,0.88) 100%)";

// ── 그리기 도구 ────────────────────────────────────────
const S = (v: unknown) => (Array.isArray(v) ? v.join("\n") : typeof v === "string" ? v : "");
const L = (v: unknown, n: number): string[] => {
  const a = Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? v.split("\n") : [];
  return Array.from({ length: n }, (_, i) => a[i] ?? "");
};

const TEXT_BASE: BlockStyle = {
  ...BASE_STYLE,
  fontId: "Pretendard",
  weight: 500,
  size: 34,
  color: INK,
  align: "left",
  vAlign: "top",
  lineHeight: 1.45,
  letterSpacing: -2,
  box: false,
  boxPad: 0,
  boxRadius: 0,
  outline: false,
  shadow: false,
};

/** 레이아웃 하나를 그리는 붓 — px 좌표(1080×1350 기준)를 받아 %로 바꿔 쌓는다 */
function canvas(ctx: LayoutCtx) {
  const sy = ctx.H / 1350;
  const shapes: Shape[] = [];
  const blocks: TextBlock[] = [];
  // 글 상자마다 늘 같은 이름표(slot) — 내 템플릿에서 고친 모양을 이 이름표로 다시 입힌다
  let n = 0;
  const slotOf = (field: string | undefined, role: TextRole) => field ?? `${role}-${n++}`;
  const pct = (x: number, y: number, w: number, h: number): Rect => ({
    x: (x / SLIDE_W) * 100,
    y: ((y * sy) / ctx.H) * 100,
    w: (w / SLIDE_W) * 100,
    h: ((h * sy) / ctx.H) * 100,
  });
  return {
    shapes,
    blocks,
    rect: pct,
    box(x: number, y: number, w: number, h: number, s: Omit<Shape, keyof Rect> = {}) {
      shapes.push({ kind: "rect", ...pct(x, y, w, h), ...s });
    },
    avatar(x: number, y: number, d: number, text: string, fill = ctx.accent) {
      shapes.push({ kind: "avatar", ...pct(x, y, d, d * (1 / sy)), fill, text });
    },
    /** text에 [앞, 칸 값, 뒤]를 주면 번호·따옴표 같은 장식을 붙이고, 고칠 때 장식을 떼고 칸 값에 넣는다 */
    text(field: string | undefined, role: TextRole, t: string | [string, string, string], x: number, y: number, w: number, h: number, st: Partial<BlockStyle> = {}) {
      const [pre, val, post] = Array.isArray(t) ? t : ["", t, ""];
      const text = val ? `${pre}${val}${post}` : "";
      // 제목이 양식보다 줄이 많으면(원본이 3줄인데 2줄 양식 등) 상자 높이에 맞게 글자를 줄인다
      const fit: Partial<BlockStyle> = {};
      if (role === "title" && text) {
        const lines = text.split("\n").length;
        const size = st.size ?? TEXT_BASE.size;
        const lh = st.lineHeight ?? TEXT_BASE.lineHeight;
        if (lines * size * lh > h) fit.size = Math.floor(h / (lines * lh));
      }
      blocks.push({
        ...TEXT_BASE,
        ...st,
        ...fit,
        ...pct(x, y, w, h),
        id: blockId(),
        role,
        original: "",
        text,
        field,
        slot: slotOf(field, role),
        fieldPre: pre || undefined,
        fieldPost: post || undefined,
      } as TextBlock);
    },
    /** 띠 라벨 (색 채운 상자 + 굵은 글) */
    chip(field: string | undefined, text: string, x: number, y: number, w: number, h: number, fill: string, st: Partial<BlockStyle> = {}) {
      blocks.push({
        ...TEXT_BASE,
        weight: 800,
        size: 30,
        lineHeight: 1.2,
        vAlign: "middle",
        ...st,
        ...pct(x, y, w, h),
        box: true,
        boxColor: fill,
        boxOpacity: 100,
        boxPad: 10,
        boxRadius: 0,
        boxBorder: true,
        boxBorderColor: INK,
        id: blockId(),
        role: "label",
        original: "",
        text,
        field,
        slot: slotOf(field, "label"),
      } as TextBlock);
    },
    /** 인스타 프로필 한 줄 (동그란 프로필 + 계정 이름 + 팔로우 버튼) */
    profile(x: number, y: number, w: number, dark: boolean) {
      const d = 100;
      this.avatar(x, y, d, (ctx.handle.replace(/^@/, "")[0] ?? "돈").toUpperCase());
      this.text(undefined, "handle", ctx.handle, x + d + 24, y + 12, w - d - 260, 50, {
        weight: 800, size: 36, color: dark ? "#ffffff" : INK, lineHeight: 1.2,
      });
      this.text(undefined, "other", "새 글 알림 받기", x + d + 24, y + 58, w - d - 260, 36, {
        size: 24, color: dark ? "rgba(255,255,255,0.6)" : MUTED, lineHeight: 1.2,
      });
      this.text(undefined, "other", "팔로우", x + w - 210, y + 22, 200, 60, {
        weight: 800, size: 28, color: "#ffffff", align: "center", vAlign: "middle", lineHeight: 1,
        box: true, boxColor: FOLLOW_BLUE, boxOpacity: 100, boxRadius: 14, boxPad: 0,
      });
    },
  };
}

const done = (c: ReturnType<typeof canvas>, bg: string, ink: Built["ink"], photo?: Rect | null): Built => ({
  bg,
  ink,
  photo,
  shapes: c.shapes,
  blocks: c.blocks,
});

const H1 = { weight: 800, lineHeight: 1.25, letterSpacing: -3 } as const;

// ── 인기 카드뉴스 양식 공통 모양 ───────────────────────
/** 사진 위 큰 흰 제목 (테두리 없이 그림자) */
const HOT_TITLE: Partial<BlockStyle> = { weight: 800, size: 84, color: "#ffffff", lineHeight: 1.22, letterSpacing: -3, shadow: true };
/** 제목 위 작은 말풍선 머리글 (검은 둥근 띠) */
const CHIP_PILL: Partial<BlockStyle> = {
  weight: 600, size: 28, color: "#ffffff", align: "center", vAlign: "middle", lineHeight: 1.2,
  box: true, boxColor: "#000000", boxOpacity: 72, boxRadius: 32, boxPad: 0,
};
/** 오른쪽 아래 댓글 유도 말풍선 */
const CTA_BUBBLE: Partial<BlockStyle> = {
  weight: 600, size: 24, color: "#ffffff", align: "center", vAlign: "middle", lineHeight: 1.35,
  box: true, boxColor: "#1f1f1f", boxOpacity: 85, boxRadius: 14, boxPad: 0,
};
const CTA_AT = [790, 1185, 230, 92] as const;
const CTA_DESC =
  "오른쪽 아래 작은 댓글 유도 말풍선. 이 장 글이나 원본에 '댓글에 ○○ 남겨' 같은 댓글 유도가 있을 때만 2줄(\\n)로 (예: \"@댓글에 '나도'\\n남겨주세요\"), 없으면 빈 문자열";

/** 사진 위 얇은 흰 테두리 글상자 (y = 상자 위쪽 px) + 오른쪽 아래 댓글 말풍선 */
function frameInner(id: string, name: string, desc: string, y: number): LayoutDef {
  return {
    id,
    kind: "inner",
    name,
    desc,
    photo: true,
    fields: [
      { key: "body", desc: "본문. 정확히 2줄(\\n), 한 줄 12~20자", max: 44 },
      { key: "cta", desc: CTA_DESC, max: 24 },
    ],
    sample: { body: "이건 테두리 글상자에\n들어가는 내지 글이에요", cta: "@댓글에 '나도'\n남겨주세요" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("body", "body", S(f.body), 170, y, 740, 190, {
        weight: 500, size: 40, color: "#ffffff", align: "center", vAlign: "middle", lineHeight: 1.4, shadow: true,
        box: true, boxColor: "#000000", boxOpacity: 18, boxRadius: 0, boxPad: 24, boxBorder: true, boxBorderColor: "#ffffff",
      });
      c.text("cta", "other", S(f.cta), ...CTA_AT, CTA_BUBBLE);
      return done(c, "#1d1d1d", "light");
    },
  };
}

// ── 표지 ──────────────────────────────────────────────
const COVERS: LayoutDef[] = [
  {
    id: "cover-classic",
    kind: "cover",
    name: "기본 썸네일",
    desc: "사진 위 왼쪽 아래 큰 제목, 검은 테두리 글씨",
    photo: true,
    fields: [{ key: "title", desc: "썸네일 제목. 정확히 3줄(\\n), 한 줄 6~14자", max: 40 }],
    sample: { title: "이건\n썸네일입니다" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("title", "title", S(f.title), 77, 621, 927, 579, styleOf(DEFAULT_TITLE, false));
      return done(c, "#1d1d1d", "light");
    },
  },
  {
    id: "cover-photo-bottom",
    kind: "cover",
    name: "사진 + 하단 제목",
    desc: "사진 아래가 어두워지고 큰 제목 세 줄",
    photo: true,
    fields: [{ key: "title", desc: "표지 제목. 정확히 3줄(\\n), 한 줄 7~13자, 궁금하게", max: 40 }],
    sample: { title: "이건\n썸네일\n입니다" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: SHADE_BOTTOM, tag: "shade" });
      c.text("title", "title", S(f.title), 80, 780, 920, 440, { ...H1, size: 92, color: "#ffffff", vAlign: "bottom" });
      return done(c, "#1d1d1d", "light");
    },
  },
  {
    id: "cover-photo-center",
    kind: "cover",
    name: "사진 + 중앙 제목",
    desc: "머리글·제목·부제·출처가 가운데에",
    photo: true,
    fields: [
      { key: "kicker", desc: "제목 위 작은 머리글 한 줄 (분야·시리즈명)", max: 16 },
      { key: "title", desc: "가운데 큰 제목. 정확히 2줄(\\n), 한 줄 6~11자", max: 24 },
      { key: "subtitle", desc: "부제 한 줄", max: 26 },
      { key: "source", desc: "출처나 기준 한 줄 (모르면 빈 문자열)", max: 20 },
    ],
    sample: { kicker: "머리글", title: "이건\n썸네일입니다", subtitle: "부제가 들어가는 줄입니다", source: "출처" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: "rgba(0,0,0,0.5)" });
      c.text("kicker", "label", S(f.kicker), 80, 470, 920, 60, { weight: 700, size: 32, color: "rgba(255,255,255,0.85)", align: "center" });
      c.text("title", "title", S(f.title), 80, 540, 920, 270, { ...H1, size: 96, color: "#ffffff", align: "center", vAlign: "middle" });
      c.text("subtitle", "subtitle", S(f.subtitle), 80, 830, 920, 70, { size: 38, color: "#ffffff", align: "center" });
      c.text("source", "source", S(f.source), 80, 930, 920, 50, { weight: 700, size: 28, color: "rgba(255,255,255,0.7)", align: "center" });
      return done(c, "#1d1d1d", "light");
    },
  },
  {
    id: "cover-photo-logo",
    kind: "cover",
    name: "사진 + 제목 + 계정",
    desc: "아래쪽 큰 제목 두 줄과 내 계정 이름",
    photo: true,
    fields: [{ key: "title", desc: "큰 제목. 정확히 2줄(\\n), 한 줄 6~11자", max: 24 }],
    sample: { title: "이건\n썸네일입니다" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: SHADE_BOTTOM, tag: "shade" });
      c.text("title", "title", S(f.title), 80, 860, 920, 280, { ...H1, size: 94, color: "#ffffff", align: "center", vAlign: "bottom" });
      c.text(undefined, "handle", ctx.handle, 340, 1190, 400, 56, {
        weight: 700, size: 26, color: "#ffffff", align: "center", vAlign: "middle",
        box: true, boxColor: "#ffffff", boxOpacity: 0, boxBorder: true, boxBorderColor: "#ffffff", boxPad: 0,
      });
      return done(c, "#1d1d1d", "light");
    },
  },
  {
    id: "cover-black-big",
    kind: "cover",
    name: "블랙 빅타이틀",
    desc: "사진이 검정으로 스며들고 아주 큰 제목",
    photo: true,
    fields: [{ key: "title", desc: "아주 큰 제목. 정확히 2줄(\\n), 한 줄 5~9자", max: 20 }],
    sample: { title: "이건\n썸네일입니다" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 820, { fill: "linear-gradient(180deg, rgba(0,0,0,0) 45%, #000 100%)", tag: "shade" });
      c.text("title", "title", S(f.title), 80, 820, 920, 400, { ...H1, size: 112, color: "#ffffff", vAlign: "bottom", lineHeight: 1.18 });
      return done(c, "#000000", "light", c.rect(0, 0, 1080, 820));
    },
  },
  {
    id: "cover-color-top",
    kind: "cover",
    name: "컬러 배경",
    desc: "포인트 색 바탕, 위 제목, 아래 사진",
    photo: true,
    fields: [{ key: "title", desc: "제목. 정확히 2줄(\\n), 한 줄 7~13자", max: 28 }],
    sample: { title: "이건\n썸네일입니다" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("title", "title", S(f.title), 80, 110, 920, 280, { ...H1, size: 80, color: "#ffffff" });
      return done(c, ctx.accent, "light", c.rect(80, 470, 920, 760));
    },
  },
  {
    id: "cover-book",
    kind: "cover",
    name: "북커버",
    desc: "종이 바탕, 굵은 띠 사이 명조 제목",
    photo: false,
    fields: [
      { key: "kicker", desc: "머리글 한 줄 (시리즈명·호수, 예: '돈작가 노트 001')", max: 18 },
      { key: "title", desc: "명조 제목. 정확히 3줄(\\n), 한 줄 4~9자", max: 27 },
    ],
    sample: { kicker: "머리글 001", title: "이건\n썸네일\n입니다" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("kicker", "label", S(f.kicker), 110, 500, 860, 50, { weight: 700, size: 28 });
      c.box(110, 565, 500, 26, { fill: ctx.accent });
      c.text("title", "title", S(f.title), 110, 620, 860, 380, {
        fontId: "NanumMyeongjo", weight: 400, size: 92, lineHeight: 1.32, letterSpacing: 4, vAlign: "middle",
      });
      c.box(110, 1030, 500, 26, { fill: ctx.accent });
      return done(c, PAPER, "dark", null);
    },
  },
  // ── 인기 카드뉴스에서 뽑은 표지 (글 위치·구성 기준) ──
  {
    id: "cover-chip-bottom",
    kind: "cover",
    name: "말풍선 + 아래 두 줄",
    desc: "작은 말풍선 머리글 아래 가운데 큰 제목 두 줄, 둘째 줄 강조",
    photo: true,
    fields: [
      { key: "kicker", desc: "제목 위 작은 말풍선 한 줄 (속마음·반응, 예: '이게 그렇게 좋다고?')", max: 18 },
      { key: "title", desc: "큰 제목. 정확히 2줄(\\n), 한 줄 7~13자. 둘째 줄이 결과·숫자 같은 핵심", max: 28 },
    ],
    sample: { kicker: "말풍선 머리글이에요", title: "이건 첫째 줄 제목\n둘째 줄은 강조돼요" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: SHADE_BOTTOM, tag: "shade" });
      c.text("kicker", "label", S(f.kicker), 270, 930, 540, 64, CHIP_PILL);
      c.text("title", "title", S(f.title), 50, 1015, 980, 250, { ...HOT_TITLE, align: "center", accentColor: ctx.accent, accentLines: [2] });
      return done(c, "#1d1d1d", "light");
    },
  },
  {
    id: "cover-chip-top",
    kind: "cover",
    name: "말풍선 + 위 두 줄",
    desc: "위쪽에 작은 말풍선 머리글과 가운데 큰 제목 두 줄",
    photo: true,
    fields: [
      { key: "kicker", desc: "제목 위 작은 말풍선 한 줄 (예: '지금 폭풍 할인중이야')", max: 18 },
      { key: "title", desc: "큰 제목. 정확히 2줄(\\n), 한 줄 7~13자", max: 28 },
    ],
    sample: { kicker: "말풍선 머리글이에요", title: "이건 위에 들어가는\n썸네일 제목이에요" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: SHADE_TOP });
      c.text("kicker", "label", S(f.kicker), 270, 130, 540, 64, CHIP_PILL);
      c.text("title", "title", S(f.title), 50, 215, 980, 250, { ...HOT_TITLE, align: "center", accentColor: ctx.accent, accentLines: [2] });
      return done(c, "#1d1d1d", "light");
    },
  },
  {
    id: "cover-center-big",
    kind: "cover",
    name: "한가운데 세 줄",
    desc: "사진 한가운데 가운데 정렬 큰 제목 세 줄 (공지·날짜형)",
    photo: true,
    fields: [{ key: "title", desc: "제목. 정확히 3줄(\\n), 한 줄 6~14자. 날짜·가격 같은 핵심을 마지막 줄에", max: 42 }],
    sample: { title: "이건 한가운데\n세 줄로 들어가는\n썸네일 제목이에요" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: "rgba(0,0,0,0.28)" });
      c.text("title", "title", S(f.title), 50, 440, 980, 470, { ...HOT_TITLE, size: 78, align: "center", vAlign: "middle" });
      return done(c, "#1d1d1d", "light");
    },
  },
  {
    id: "cover-kicker-left",
    kind: "cover",
    name: "머리글 + 왼쪽 두 줄",
    desc: "왼쪽 아래 작은 머리글 한 줄과 담백한 제목 두 줄 (레시피·시리즈형)",
    photo: true,
    fields: [
      { key: "kicker", desc: "작은 머리글 한 줄 (시리즈·출처, 예: '60년 종가집 며느리 레시피')", max: 20 },
      { key: "title", desc: "제목. 1~2줄(\\n), 한 줄 8~16자", max: 32 },
    ],
    sample: { kicker: "작은 머리글이에요", title: "이건 왼쪽 아래\n썸네일 제목이에요" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: SHADE_BOTTOM, tag: "shade" });
      c.text("kicker", "label", S(f.kicker), 60, 1000, 960, 60, { weight: 500, size: 40, color: "#ffffff", lineHeight: 1.2, shadow: true });
      c.text("title", "title", S(f.title), 60, 1070, 960, 220, { weight: 600, size: 76, color: "#ffffff", lineHeight: 1.3, letterSpacing: -2, shadow: true });
      return done(c, "#1d1d1d", "light");
    },
  },
  {
    id: "cover-three-accent",
    kind: "cover",
    name: "머리글 + 세 줄, 끝줄 강조",
    desc: "작은 머리글 아래 가운데 큰 제목 세 줄, 마지막 줄 강조",
    photo: true,
    fields: [
      { key: "kicker", desc: "작은 머리글 한 줄 (예: '이거 하나면 그냥 끝나요')", max: 20 },
      { key: "title", desc: "큰 제목. 정확히 3줄(\\n), 한 줄 6~13자. 마지막 줄이 핵심(결과·대상)", max: 40 },
    ],
    sample: { kicker: "작은 머리글이에요", title: "이건 첫째 줄\n둘째 줄 제목\n마지막 줄은 강조" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: SHADE_BOTTOM, tag: "shade" });
      c.text("kicker", "label", S(f.kicker), 60, 880, 960, 52, { weight: 600, size: 32, color: "#ffffff", align: "center", lineHeight: 1.2, shadow: true });
      c.text("title", "title", S(f.title), 50, 945, 980, 330, { ...HOT_TITLE, size: 76, align: "center", accentColor: ctx.accent, accentLines: [3] });
      return done(c, "#1d1d1d", "light");
    },
  },
  {
    id: "cover-price",
    kind: "cover",
    name: "위 제목 + 가격표",
    desc: "위쪽 말풍선·제목 두 줄, 오른쪽 아래 할인 가격표 (특가·할인형)",
    photo: true,
    fields: [
      { key: "kicker", desc: "제목 위 작은 말풍선 한 줄 (예: '이 가격 실화나 진짜..?')", max: 18 },
      { key: "title", desc: "큰 제목. 정확히 2줄(\\n), 한 줄 7~13자", max: 28 },
      { key: "tag", desc: "가격표 맨 위 이름 (예: '블프 특가'). 모르면 빈 문자열", max: 8 },
      { key: "was", desc: "원래 가격 (예: '정가 60,000원'). 글에 없으면 빈 문자열", max: 14 },
      { key: "off", desc: "할인율 (예: '60%'). 글에 없으면 빈 문자열", max: 5 },
      { key: "price", desc: "할인 가격 (예: '23,600원'). 글에 없으면 빈 문자열", max: 10 },
    ],
    sample: { kicker: "말풍선 머리글이에요", title: "이건 특가 소식\n썸네일 제목이에요", tag: "특가", was: "정가 00,000원", off: "00%", price: "00,000원" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: SHADE_TOP });
      c.text("kicker", "label", S(f.kicker), 270, 130, 540, 64, CHIP_PILL);
      c.text("title", "title", S(f.title), 50, 215, 980, 250, { ...HOT_TITLE, align: "center", accentColor: ctx.accent, accentLines: [2] });
      if (S(f.price)) {
        c.box(690, 860, 330, 380, { fill: "#ffffff", radius: 18 });
        c.text("tag", "label", S(f.tag), 710, 885, 290, 60, { weight: 800, size: 36, align: "center", vAlign: "middle", lineHeight: 1.1 });
        c.text("was", "other", S(f.was), 710, 960, 290, 50, { size: 26, color: MUTED, align: "center", vAlign: "middle", lineHeight: 1.1 });
        c.text("off", "number", S(f.off), 780, 1025, 150, 64, {
          weight: 800, size: 34, color: "#ffffff", align: "center", vAlign: "middle", lineHeight: 1,
          box: true, boxColor: ctx.accent, boxOpacity: 100, boxRadius: 10, boxPad: 0,
        });
        c.text("price", "number", S(f.price), 710, 1110, 290, 90, { weight: 800, size: 52, color: ctx.accent, align: "center", vAlign: "middle", lineHeight: 1, letterSpacing: -3 });
      }
      return done(c, "#1d1d1d", "light");
    },
  },
];

// ── 속지 ──────────────────────────────────────────────
const INNERS: LayoutDef[] = [
  {
    id: "inner-textbox",
    kind: "inner",
    name: "기본 텍스트 박스",
    desc: "사진 위 가운데 반투명 흰 박스 + 테두리 글씨",
    photo: true,
    fields: [{ key: "body", desc: "본문. 정확히 3줄(\\n), 한 줄 12~18자", max: 60 }],
    sample: { body: "이건 내지입니다\n텍스트 박스 템플릿이에요" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("body", "body", S(f.body), 168, 953, 743, 258, styleOf(DEFAULT_BODY, false));
      return done(c, "#1d1d1d", "light");
    },
  },
  {
    id: "info-table",
    kind: "inner",
    name: "항목 정리표",
    desc: "제목·소개 아래 항목 이름과 내용 네 줄",
    photo: false,
    fields: [
      { key: "title", desc: "표 제목. 2줄(\\n)", max: 24 },
      { key: "intro", desc: "제목 아래 한 줄 소개", max: 34 },
      { key: "labels", desc: "항목 이름 (2~5자)", max: 6, count: 4 },
      { key: "contents", desc: "항목 내용. '· '로 시작하는 1~2줄(\\n)", max: 44, count: 4 },
    ],
    sample: { title: "이건 항목 정리표\n템플릿입니다", intro: "이건 소개 줄입니다.", labels: ["항목 1", "항목 2", "항목 3", "항목 4"], contents: ["· 이건 내용입니다\n· 두 줄까지 들어갑니다", "· 이건 내용입니다", "· 이건 내용입니다", "· 이건 내용입니다"] },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("title", "title", S(f.title), 80, 110, 920, 200, { ...H1, size: 72 });
      c.text("intro", "subtitle", S(f.intro), 80, 320, 920, 56, { size: 30, color: MUTED });
      const labels = L(f.labels, 4), contents = L(f.contents, 4);
      for (let i = 0; i < 4; i++) {
        const y = 440 + i * 210;
        c.chip(`labels.${i}`, labels[i], 80, y, 210, 66, "#ffffff", { size: 28, align: "center" });
        c.text(`contents.${i}`, "body", contents[i], 330, y + 4, 670, 170, { size: 32 });
      }
      return done(c, PAPER, "dark", null);
    },
  },
  {
    id: "numbered-list",
    kind: "inner",
    name: "번호 리스트",
    desc: "번호 붙은 여덟 줄, 원하는 줄만 색 강조",
    photo: false,
    fields: [
      { key: "title", desc: "목록 제목 한 줄", max: 22 },
      { key: "items", desc: "항목 한 줄 (번호 없이)", max: 24, count: 8 },
      { key: "hl", desc: "색으로 강조할 항목 번호들 (예: '3,4'). 없으면 빈 문자열", max: 10 },
    ],
    sample: { title: "이건 번호 리스트 템플릿입니다", items: ["첫 번째 항목입니다", "두 번째 항목입니다", "세 번째 항목입니다", "네 번째 항목입니다", "다섯 번째 항목입니다", "여섯 번째 항목입니다", "일곱 번째 항목입니다", "여덟 번째 항목입니다"], hl: "3,4" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("title", "title", S(f.title), 80, 120, 920, 100, { ...H1, size: 64 });
      const hl = new Set(S(f.hl).split(/[^0-9]+/).filter(Boolean).map(Number));
      L(f.items, 8).forEach((t, i) => {
        c.text(`items.${i}`, "body", [`${i + 1}. `, t, ""], 80, 290 + i * 110, 920, 90, {
          weight: 700, size: 44, color: hl.has(i + 1) ? ctx.accent : INK, lineHeight: 1.3,
        });
      });
      return done(c, PAPER, "dark", null);
    },
  },
  {
    id: "checklist",
    kind: "inner",
    name: "체크리스트",
    desc: "체크칸 여섯 줄과 안내 띠",
    photo: false,
    fields: [
      { key: "title", desc: "제목. 2줄(\\n), 한 줄 4~9자", max: 20 },
      { key: "tag", desc: "띠 안 짧은 안내 (예: '하나씩 확인해 보세요')", max: 14 },
      { key: "items", desc: "확인할 일 한 줄", max: 24, count: 6 },
    ],
    sample: { title: "이건 체크리스트\n템플릿입니다", tag: "안내 띠입니다", items: ["첫 번째 항목입니다", "두 번째 항목입니다", "세 번째 항목입니다", "네 번째 항목입니다", "다섯 번째 항목입니다", "여섯 번째 항목입니다"] },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("title", "title", S(f.title), 80, 100, 920, 230, { ...H1, size: 84 });
      c.chip("tag", S(f.tag), 80, 350, 380, 62, CHIP.yellow, { size: 26 });
      L(f.items, 6).forEach((t, i) => {
        const y = 470 + i * 135;
        c.box(80, y + 8, 60, 60, { fill: "#ffffff", border: INK, bw: 3 });
        c.text(`items.${i}`, "body", t, 170, y + 6, 830, 70, { weight: 700, size: 40, vAlign: "middle" });
        c.box(80, y + 105, 920, 2, { fill: "#dddddd" });
      });
      return done(c, "#ffffff", "dark", null);
    },
  },
  {
    id: "ranking",
    kind: "inner",
    name: "TOP 랭킹",
    desc: "1~5위 번호 + 이름 + 이유 한 줄",
    photo: false,
    fields: [
      { key: "title", desc: "순위표 제목 한 줄 (예: '자취생 필수템 TOP 5')", max: 20 },
      { key: "tag", desc: "띠 안 해시태그 1~2개", max: 14 },
      { key: "names", desc: "순위 항목 이름", max: 18, count: 5 },
      { key: "reasons", desc: "그 순위인 이유 한 줄", max: 28, count: 5 },
    ],
    sample: { title: "이건 랭킹 템플릿입니다", tag: "#태그", names: ["1위 이름입니다", "2위 이름입니다", "3위 이름입니다", "4위 이름입니다", "5위 이름입니다"], reasons: Array(5).fill("이건 이유 한 줄입니다") },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("title", "title", S(f.title), 80, 100, 920, 110, { ...H1, size: 76 });
      c.chip("tag", S(f.tag), 80, 230, 300, 58, CHIP.orange, { size: 24 });
      const names = L(f.names, 5), reasons = L(f.reasons, 5);
      for (let i = 0; i < 5; i++) {
        const y = 350 + i * 190;
        c.text(undefined, "number", String(i + 1), 80, y, 92, 92, {
          weight: 800, size: 46, color: "#ffffff", align: "center", vAlign: "middle", lineHeight: 1,
          box: true, boxColor: i === 0 ? ctx.accent : INK, boxOpacity: 100, boxPad: 0,
        });
        c.text(`names.${i}`, "subtitle", names[i], 205, y - 2, 795, 60, { weight: 800, size: 44, lineHeight: 1.25 });
        c.text(`reasons.${i}`, "body", reasons[i], 205, y + 56, 795, 48, { size: 30, color: MUTED, lineHeight: 1.3 });
      }
      return done(c, "#ffffff", "dark", null);
    },
  },
  {
    id: "compare",
    kind: "inner",
    name: "A/B 비교",
    desc: "두 가지를 항목별로 나란히",
    photo: false,
    fields: [
      { key: "title", desc: "비교 제목 한 줄", max: 18 },
      { key: "a", desc: "비교 대상 A 이름", max: 10 },
      { key: "b", desc: "비교 대상 B 이름", max: 10 },
      { key: "labels", desc: "비교 항목 이름 (2~4자, 예: 가격·크기·장점·단점)", max: 5, count: 4 },
      { key: "as", desc: "A의 내용. 1~2줄(\\n)", max: 22, count: 4 },
      { key: "bs", desc: "B의 내용. 1~2줄(\\n)", max: 22, count: 4 },
    ],
    sample: { title: "이건 비교 템플릿입니다", a: "A", b: "B", labels: ["항목 1", "항목 2", "항목 3", "항목 4"], as: Array(4).fill("이건 A의\n내용입니다"), bs: Array(4).fill("이건 B의\n내용입니다") },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("title", "title", S(f.title), 80, 110, 920, 130, { ...H1, size: 66 });
      c.chip("a", S(f.a), 290, 300, 345, 72, CHIP.yellow, { align: "center", size: 32 });
      c.chip("b", S(f.b), 655, 300, 345, 72, CHIP.blue, { align: "center", size: 32 });
      const labels = L(f.labels, 4), as = L(f.as, 4), bs = L(f.bs, 4);
      for (let i = 0; i < 4; i++) {
        const y = 420 + i * 215;
        c.chip(`labels.${i}`, labels[i], 80, y, 180, 62, "#ffffff", { size: 26, align: "center" });
        c.text(`as.${i}`, "body", as[i], 290, y + 4, 345, 170, { size: 32 });
        c.text(`bs.${i}`, "body", bs[i], 655, y + 4, 345, 170, { size: 32 });
        if (i < 3) c.box(80, y + 190, 920, 2, { fill: "#e3e3e3" });
      }
      return done(c, "#ffffff", "dark", null);
    },
  },
  {
    id: "pros-cons",
    kind: "inner",
    name: "장단점",
    desc: "위 사진, 좋은 점·아쉬운 점 각 세 줄",
    photo: true,
    fields: [
      { key: "goods", desc: "좋은 점 한 줄", max: 26, count: 3 },
      { key: "bads", desc: "아쉬운 점 한 줄", max: 26, count: 3 },
    ],
    sample: { goods: Array(3).fill("이건 좋은 점입니다"), bads: Array(3).fill("이건 아쉬운 점입니다") },
    build(f, ctx) {
      const c = canvas(ctx);
      c.chip(undefined, "좋은 점", 80, 580, 200, 64, CHIP.green, { align: "center", size: 30 });
      L(f.goods, 3).forEach((t, i) => c.text(`goods.${i}`, "body", ["· ", t, ""], 80, 670 + i * 64, 920, 60, { size: 34 }));
      c.chip(undefined, "아쉬운 점", 80, 900, 220, 64, CHIP.pink, { align: "center", size: 30 });
      L(f.bads, 3).forEach((t, i) => c.text(`bads.${i}`, "body", ["· ", t, ""], 80, 990 + i * 64, 920, 60, { size: 34 }));
      return done(c, "#ffffff", "dark", c.rect(0, 0, 1080, 520));
    },
  },
  {
    id: "timeline",
    kind: "inner",
    name: "타임라인",
    desc: "시간 순서로 이어지는 다섯 단계",
    photo: false,
    fields: [
      { key: "title", desc: "일정 제목 한 줄 (예: '성수동 하루 코스')", max: 18 },
      { key: "tag", desc: "띠 안 해시태그 1~2개", max: 14 },
      { key: "times", desc: "시간이나 순서 (예: '오전 9시', 'STEP 1')", max: 8, count: 5 },
      { key: "places", desc: "할 일이나 장소", max: 18, count: 5 },
      { key: "descs", desc: "짧은 설명 한 줄", max: 28, count: 5 },
    ],
    sample: { title: "이건 타임라인 템플릿입니다", tag: "#태그", times: ["STEP 1", "STEP 2", "STEP 3", "STEP 4", "STEP 5"], places: Array(5).fill("이건 단계 이름입니다"), descs: Array(5).fill("이건 짧은 설명입니다.") },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("title", "title", S(f.title), 80, 100, 920, 110, { ...H1, size: 72 });
      c.chip("tag", S(f.tag), 80, 230, 300, 56, CHIP.green, { size: 24 });
      c.box(178, 400, 4, 820, { fill: INK });
      const times = L(f.times, 5), places = L(f.places, 5), descs = L(f.descs, 5);
      for (let i = 0; i < 5; i++) {
        const y = 350 + i * 190;
        c.chip(`times.${i}`, times[i], 80, y, 200, 60, "#ffffff", { size: 24, align: "center", weight: 700 });
        c.text(`places.${i}`, "subtitle", places[i], 320, y - 2, 680, 60, { weight: 800, size: 40, lineHeight: 1.3 });
        c.text(`descs.${i}`, "body", descs[i], 320, y + 58, 680, 50, { size: 30, color: "#444444", lineHeight: 1.3 });
      }
      return done(c, "#ffffff", "dark", null);
    },
  },
  {
    id: "qa",
    kind: "inner",
    name: "Q&A",
    desc: "색 띠 질문 세 개와 답",
    photo: false,
    fields: [
      { key: "qs", desc: "질문 한 줄 (Q 번호 없이)", max: 22, count: 3 },
      { key: "as", desc: "답 2~3줄 분량의 문장", max: 80, count: 3 },
    ],
    sample: { qs: Array(3).fill("이건 질문입니다"), as: Array(3).fill("이건 답입니다. 두세 줄 정도 들어가는 자리예요.") },
    build(f, ctx) {
      const c = canvas(ctx);
      const qs = L(f.qs, 3), as = L(f.as, 3);
      const fills = [CHIP.orange, CHIP.green, CHIP.blue];
      for (let i = 0; i < 3; i++) {
        const y = 110 + i * 400;
        c.chip(`qs.${i}`, qs[i] ? `Q${i + 1}. ${qs[i]}` : "", 80, y, 760, 88, fills[i], { size: 38 });
        const qb = c.blocks[c.blocks.length - 1];
        qb.fieldPre = qs[i] ? `Q${i + 1}. ` : undefined;
        c.text(`as.${i}`, "body", ["A. ", as[i], ""], 100, y + 120, 900, 220, { size: 34, lineHeight: 1.55 });
      }
      return done(c, "#ffffff", "dark", null);
    },
  },
  {
    id: "person",
    kind: "inner",
    name: "인물 프로필",
    desc: "왼쪽 사진, 이름·태그·소개와 항목 네 줄",
    photo: true,
    fields: [
      { key: "name", desc: "이름 (2줄 가능, \\n)", max: 14 },
      { key: "tag", desc: "띠 안 해시태그 (예: '#직업 #소개')", max: 14 },
      { key: "intro", desc: "그 사람 소개 2~3줄", max: 60 },
      { key: "labels", desc: "항목 이름 (예: 하는 일·좋아하는 것·한마디)", max: 6, count: 4 },
      { key: "contents", desc: "항목 내용 한 줄", max: 26, count: 4 },
    ],
    sample: { name: "이건 인물\n프로필입니다", tag: "#태그", intro: "이건 인물 소개 글입니다. 세 줄 정도 들어가요.", labels: ["항목 1", "항목 2", "항목 3", "항목 4"], contents: Array(4).fill("이건 내용입니다.") },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("name", "title", S(f.name), 540, 100, 460, 210, { ...H1, size: 66 });
      c.chip("tag", S(f.tag), 540, 325, 300, 56, CHIP.blue, { size: 24 });
      c.text("intro", "body", S(f.intro), 540, 410, 460, 200, { size: 30 });
      const labels = L(f.labels, 4), contents = L(f.contents, 4);
      for (let i = 0; i < 4; i++) {
        const y = 700 + i * 140;
        c.chip(`labels.${i}`, labels[i], 80, y, 210, 64, "#ffffff", { size: 24, align: "center", weight: 700 });
        c.text(`contents.${i}`, "body", contents[i], 330, y + 6, 670, 110, { size: 32 });
      }
      return done(c, "#ffffff", "dark", c.rect(80, 100, 420, 520));
    },
  },
  {
    id: "product",
    kind: "inner",
    name: "제품 카드",
    desc: "제품 사진, 이름 띠, 정보 세 줄, 한 줄 평",
    photo: true,
    fields: [
      { key: "name", desc: "제품 이름 한 줄", max: 20 },
      { key: "labels", desc: "항목 이름 (예: 가격·구매처·추천)", max: 5, count: 3 },
      { key: "contents", desc: "항목 내용 한 줄 (모르는 가격은 지어내지 말 것)", max: 26, count: 3 },
      { key: "quote", desc: "한 줄 평. 1~2줄(\\n)", max: 44 },
    ],
    sample: { name: "이건 제품 카드입니다", labels: ["항목 1", "항목 2", "항목 3"], contents: Array(3).fill("이건 내용입니다."), quote: "이건 한 줄 평입니다.\n두 줄까지 들어가요." },
    build(f, ctx) {
      const c = canvas(ctx);
      c.chip("name", S(f.name), 80, 650, 640, 82, CHIP.pink, { size: 38 });
      const labels = L(f.labels, 3), contents = L(f.contents, 3);
      for (let i = 0; i < 3; i++) {
        const y = 770 + i * 92;
        c.chip(`labels.${i}`, labels[i], 80, y, 170, 60, "#ffffff", { size: 24, align: "center", weight: 700 });
        c.text(`contents.${i}`, "body", contents[i], 280, y + 6, 720, 56, { size: 32, vAlign: "middle" });
      }
      c.text("quote", "body", S(f.quote), 80, 1070, 920, 190, {
        size: 32, color: "#ffffff", vAlign: "middle", box: true, boxColor: "#000000", boxOpacity: 100, boxPad: 30,
      });
      return done(c, "#ffffff", "dark", c.rect(80, 90, 920, 520));
    },
  },
  {
    id: "photo-sub-body",
    kind: "inner",
    name: "사진 위 · 글 아래",
    desc: "위에 사진, 아래 소제목과 본문",
    photo: true,
    fields: [
      { key: "subtitle", desc: "소제목 한 줄", max: 20 },
      { key: "body", desc: "본문 2문단(문단 사이 빈 줄 \\n\\n), 4~6줄 분량", max: 160 },
    ],
    sample: { subtitle: "이건 내지입니다", body: "이건 본문입니다. 위에는 사진이, 여기에는 글이 들어가요.\n\n문단을 나눠 쓸 수 있어요." },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("subtitle", "subtitle", S(f.subtitle), 80, 690, 920, 90, { weight: 800, size: 56, lineHeight: 1.25 });
      c.text("body", "body", S(f.body), 80, 800, 920, 460, { size: 34, lineHeight: 1.6 });
      return done(c, "#ffffff", "dark", c.rect(0, 0, 1080, 630));
    },
  },
  {
    id: "numbering",
    kind: "inner",
    name: "번호 소제목",
    desc: "포인트 색 번호 소제목 + 설명",
    photo: false,
    fields: [
      { key: "num", desc: "번호 (이 장의 순서, 숫자만)", max: 2 },
      { key: "heading", desc: "소제목 한 줄", max: 18 },
      { key: "body", desc: "설명 문단 3~6줄 분량", max: 170 },
    ],
    sample: { num: "1", heading: "이건 번호 소제목입니다", body: "이건 설명 글입니다. 팁이나 방법을 하나씩 소개할 때 써요." },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("heading", "title", [`${S(f.num) || "1"}. `, S(f.heading), ""], 80, 150, 920, 180, { ...H1, size: 64, color: ctx.accent });
      c.text("body", "body", S(f.body), 80, 360, 920, 760, { size: 36, lineHeight: 1.65 });
      return done(c, PAPER, "dark", null);
    },
  },
  {
    id: "numbering-dark",
    kind: "inner",
    name: "번호 소제목 (어두운)",
    desc: "사진 위 어두운 바탕에 번호 소제목 + 설명",
    photo: true,
    fields: [
      { key: "num", desc: "번호 (숫자만)", max: 2 },
      { key: "heading", desc: "소제목 한 줄", max: 18 },
      { key: "body", desc: "설명 3~4줄 분량", max: 110 },
    ],
    sample: { num: "1", heading: "이건 번호 소제목입니다", body: "이건 설명 글입니다. 사진 위에 밝은 글씨로 들어가요." },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: SHADE_TOP });
      c.text("heading", "title", [`${S(f.num) || "1"}. `, S(f.heading), ""], 80, 100, 920, 170, { ...H1, size: 64, color: "#ffffff" });
      c.text("body", "body", S(f.body), 80, 290, 920, 300, { size: 34, color: "rgba(255,255,255,0.9)", lineHeight: 1.6 });
      return done(c, "#111111", "light");
    },
  },
  {
    id: "quote-page",
    kind: "inner",
    name: "가운데 글",
    desc: "검정 바탕 가운데 정렬 글 한 편",
    photo: false,
    fields: [{ key: "text", desc: "한 편의 글. 2~3문단(빈 줄 \\n\\n로 구분), 문단마다 2줄", max: 160 }],
    sample: { text: "이건 내지입니다.\n\n가운데 정렬로\n글 한 편이 들어가요." },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("text", "body", S(f.text), 100, 260, 880, 830, { weight: 700, size: 44, color: "#ffffff", align: "center", vAlign: "middle", lineHeight: 1.6 });
      return done(c, "#000000", "light", null);
    },
  },
  {
    id: "essay",
    kind: "inner",
    name: "긴 글",
    desc: "첫 문장 강조 + 긴 본문",
    photo: false,
    fields: [
      { key: "lead", desc: "글을 여는 첫 문장 (따옴표 없이)", max: 30 },
      { key: "body", desc: "긴 본문 2문단(\\n\\n), 8~10줄 분량", max: 260 },
    ],
    sample: { lead: "이건 첫 문장입니다", body: "이건 긴 글 템플릿입니다. 한 장에 열 줄 안팎이 들어가요.\n\n글이 길면 다음 장으로 이어 쓰면 돼요." },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("lead", "subtitle", ["“", S(f.lead), "”"], 80, 130, 920, 150, { weight: 800, size: 46, lineHeight: 1.4 });
      c.text("body", "body", S(f.body), 80, 320, 920, 900, { size: 36, lineHeight: 1.75 });
      return done(c, PAPER, "dark", null);
    },
  },
  {
    id: "item-intro",
    kind: "inner",
    name: "아이템 쇼케이스",
    desc: "번호 + 이름, 가운데 사진, 한 줄 설명",
    photo: true,
    fields: [
      { key: "num", desc: "번호 두 자리 (예: '01')", max: 3 },
      { key: "name", desc: "아이템 이름 한 줄", max: 14 },
      { key: "quote", desc: "한 줄 설명 (따옴표 없이)", max: 22 },
      { key: "desc", desc: "소개 3~4줄 분량", max: 80 },
    ],
    sample: { num: "01", name: "아이템 이름", quote: "이건 한 줄 설명입니다", desc: "이건 아이템 소개 글입니다. 서너 줄 정도 들어가요." },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("num", "number", ["", S(f.num) || "01", "."], 80, 100, 920, 90, { weight: 800, size: 72, color: "#ffffff", align: "center", lineHeight: 1.1 });
      c.text("name", "title", S(f.name), 80, 190, 920, 100, { ...H1, size: 72, color: "#ffffff", align: "center" });
      c.text("quote", "subtitle", ["“", S(f.quote), "”"], 80, 880, 920, 80, { weight: 700, size: 42, color: "#ffffff", align: "center" });
      c.text("desc", "body", S(f.desc), 140, 980, 800, 260, { size: 32, color: "rgba(255,255,255,0.75)", align: "center", lineHeight: 1.55 });
      return done(c, "linear-gradient(180deg, #2a2a2a 0%, #0c0c0c 100%)", "light", c.rect(290, 320, 500, 520));
    },
  },
  {
    id: "reasons",
    kind: "inner",
    name: "이유 세 가지",
    desc: "제목 띠, 큰 사진, 이유 세 줄",
    photo: true,
    fields: [
      { key: "title", desc: "질문형 제목 한 줄 (예: '이걸 왜 샀을까?')", max: 18 },
      { key: "reasons", desc: "이유 한 줄", max: 28, count: 3 },
    ],
    sample: { title: "이건 이유 템플릿입니다", reasons: ["이건 첫 번째 이유입니다.", "이건 두 번째 이유입니다.", "이건 세 번째 이유입니다."] },
    build(f, ctx) {
      const c = canvas(ctx);
      c.chip("title", S(f.title), 80, 90, 640, 92, CHIP.blue, { size: 44 });
      L(f.reasons, 3).forEach((t, i) => {
        const y = 850 + i * 115;
        c.chip(undefined, `이유 ${i + 1}`, 80, y, 170, 62, "#ffffff", { size: 24, align: "center", weight: 700 });
        c.text(`reasons.${i}`, "body", t, 280, y + 4, 720, 60, { size: 34, vAlign: "middle" });
      });
      return done(c, "#ffffff", "dark", c.rect(80, 220, 920, 580));
    },
  },
  {
    id: "dark-card",
    kind: "inner",
    name: "하단 블랙 카드",
    desc: "위 사진, 아래 검정 칸에 번호·제목·설명",
    photo: true,
    fields: [
      { key: "num", desc: "번호 (숫자만)", max: 2 },
      { key: "title", desc: "한 줄 제목", max: 18 },
      { key: "desc", desc: "설명 2~3줄 분량", max: 70 },
    ],
    sample: { num: "1", title: "이건 내지입니다", desc: "이건 설명 글입니다. 두세 줄 정도 들어가요." },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 800, 1080, 550, { fill: "#000000" });
      c.text("num", "number", S(f.num) || "1", 80, 860, 50, 50, {
        weight: 800, size: 26, color: "#ffffff", align: "center", vAlign: "middle", lineHeight: 1,
        box: true, boxColor: "#555555", boxOpacity: 100, boxPad: 0,
      });
      c.text("title", "title", S(f.title), 80, 935, 920, 100, { ...H1, size: 60, color: "#ffffff" });
      c.text("desc", "body", S(f.desc), 80, 1050, 920, 220, { size: 32, color: "rgba(255,255,255,0.75)", lineHeight: 1.55 });
      return done(c, "#000000", "light", c.rect(0, 0, 1080, 800));
    },
  },
  {
    id: "place",
    kind: "inner",
    name: "장소 소개",
    desc: "사진 위 장소 이름, 위치, 소개",
    photo: true,
    fields: [
      { key: "name", desc: "장소·공간 이름", max: 16 },
      { key: "way", desc: "가는 길이나 위치 한 줄 (모르면 분위기 한 줄)", max: 24 },
      { key: "intro", desc: "공간 소개 3~4줄 분량 (분위기·추천·좋은 시간)", max: 90 },
    ],
    sample: { name: "이건 장소 이름입니다", way: "이건 위치 한 줄입니다", intro: "이건 장소 소개 글입니다. 분위기나 추천할 점을 적어요." },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0.92) 100%)", tag: "shade" });
      c.box(510, 860, 60, 3, { fill: "#ffffff" });
      c.text("name", "title", S(f.name), 80, 890, 920, 80, { weight: 800, size: 52, color: "#ffffff", align: "center", lineHeight: 1.2 });
      c.text("way", "subtitle", S(f.way), 80, 980, 920, 50, { size: 30, color: "rgba(255,255,255,0.85)", align: "center" });
      c.text("intro", "body", S(f.intro), 140, 1050, 800, 220, { size: 30, color: "rgba(255,255,255,0.85)", align: "center", lineHeight: 1.6 });
      return done(c, "#111111", "light");
    },
  },
  {
    id: "book-music",
    kind: "inner",
    name: "책·음악 추천",
    desc: "한 줄 문장, 가운데 표지 사진, 한 구절과 출처",
    photo: true,
    fields: [
      { key: "line", desc: "소개하는 것에 대한 한 줄 문장. 2줄(\\n)", max: 36 },
      { key: "quote", desc: "속 한 구절이나 핵심 문장. 2줄(\\n), 따옴표 없이", max: 36 },
      { key: "credit", desc: "만든 사람 - 제목 (예: '저자 - 책 제목')", max: 26 },
    ],
    sample: { line: "이건 책·음악 추천\n템플릿입니다.", quote: "이건 인상 깊은\n한 구절입니다", credit: "만든 사람 - 제목" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("line", "subtitle", S(f.line), 100, 150, 880, 120, { weight: 700, size: 36, align: "center", lineHeight: 1.45 });
      c.text("quote", "body", ["“", S(f.quote), "”"], 100, 860, 880, 130, { weight: 700, size: 38, align: "center", lineHeight: 1.45 });
      c.text("credit", "source", S(f.credit), 100, 1000, 880, 60, { size: 28, color: MUTED, align: "center" });
      return done(c, PAPER, "dark", c.rect(290, 310, 500, 500));
    },
  },
  // ── 인기 카드뉴스에서 뽑은 속지 (글 위치·구성 기준) ──
  frameInner("inner-frame-bottom", "테두리 글상자 (아래)", "사진 위 아래쪽에 얇은 흰 테두리 글상자 + 댓글 말풍선", 960),
  frameInner("inner-frame-center", "테두리 글상자 (가운데)", "사진 위 한가운데 얇은 흰 테두리 글상자 + 댓글 말풍선", 580),
  frameInner("inner-frame-top", "테두리 글상자 (위)", "사진 위 위쪽에 얇은 흰 테두리 글상자 + 댓글 말풍선", 140),
  {
    id: "inner-plain-center",
    kind: "inner",
    name: "상자 없는 글 (가운데 아래)",
    desc: "사진 위 가운데 아래쪽에 상자 없이 흰 글 두세 줄",
    photo: true,
    fields: [
      { key: "body", desc: "본문. 2~3줄(\\n), 한 줄 13~20자", max: 60 },
      { key: "cta", desc: CTA_DESC, max: 24 },
    ],
    sample: { body: "이건 상자 없이 들어가는\n내지 글이에요", cta: "" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: SHADE_BOTTOM, tag: "shade" });
      c.text("body", "body", S(f.body), 70, 860, 940, 240, { weight: 600, size: 46, color: "#ffffff", align: "center", vAlign: "middle", lineHeight: 1.45, shadow: true });
      c.text("cta", "other", S(f.cta), ...CTA_AT, CTA_BUBBLE);
      return done(c, "#1d1d1d", "light");
    },
  },
  {
    id: "inner-hand-top",
    kind: "inner",
    name: "손글씨 메모 (왼쪽 위)",
    desc: "사진 왼쪽 위에 손글씨로 말하듯 여러 줄 + 아래 댓글 안내",
    photo: true,
    fields: [
      { key: "body", desc: "말하듯 편한 글. 3~4줄(\\n), 한 줄 12~20자", max: 80 },
      { key: "cta", desc: "아래 둥근 댓글 안내 한 줄 (예: \"댓글에 '나도' 남겨줘\"). 댓글 유도가 없으면 빈 문자열", max: 20 },
    ],
    sample: { body: "이건 손글씨로\n왼쪽 위에 들어가는\n내지 글이에요", cta: "" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: SHADE_TOP });
      c.text("body", "body", S(f.body), 70, 110, 880, 460, { fontId: "NanumPen", weight: 400, size: 66, color: "#ffffff", lineHeight: 1.3, letterSpacing: 0, shadow: true });
      c.text("cta", "other", S(f.cta), 260, 1150, 560, 76, {
        weight: 700, size: 30, color: "#141414", align: "center", vAlign: "middle", lineHeight: 1.2,
        box: true, boxColor: "#ffffff", boxOpacity: 88, boxRadius: 38, boxPad: 0,
      });
      return done(c, "#1d1d1d", "light");
    },
  },
  {
    id: "inner-memo-top",
    kind: "inner",
    name: "흰 메모 카드 (위)",
    desc: "사진 위쪽 가운데 작은 흰 카드에 검은 글 두세 줄",
    photo: true,
    fields: [{ key: "body", desc: "본문. 2~3줄(\\n), 한 줄 16~26자. 마지막 줄에 댓글 유도가 있으면 넣어도 됨", max: 80 }],
    sample: { body: "이건 흰 메모 카드에 들어가는\n내지 글이에요" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("body", "body", S(f.body), 170, 140, 740, 200, {
        weight: 600, size: 32, color: "#141414", align: "center", vAlign: "middle", lineHeight: 1.5,
        box: true, boxColor: "#ffffff", boxOpacity: 96, boxRadius: 6, boxPad: 22,
      });
      return done(c, "#1d1d1d", "light");
    },
  },
];

// ── 마지막 장 ─────────────────────────────────────────
const LASTS: LayoutDef[] = [
  {
    id: "last-ask3",
    kind: "last",
    name: "저장·공유·팔로우",
    desc: "번호 붙은 부탁 세 줄과 프로필",
    photo: false,
    fields: [
      { key: "title", desc: "마무리 제목. 2줄(\\n), 한 줄 6~11자", max: 24 },
      { key: "asks", desc: "독자에게 부탁할 행동 한 줄 (저장·공유·팔로우·댓글 등)", max: 22, count: 3 },
    ],
    sample: { title: "이건\n마지막 장입니다", asks: ["저장해 두고 다시 보기", "친구에게 공유하기", "팔로우하고 새 글 받기"] },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("title", "title", S(f.title), 80, 130, 920, 220, { ...H1, size: 72, align: "center", vAlign: "middle" });
      L(f.asks, 3).forEach((t, i) => {
        const y = 420 + i * 140;
        c.box(80, y, 920, 112, { fill: "#ffffff", border: "#e2e2e2", bw: 2, radius: 20 });
        c.text(undefined, "number", `0${i + 1}`, 110, y + 26, 90, 60, { weight: 800, size: 36, color: ctx.accent, vAlign: "middle" });
        c.text(`asks.${i}`, "body", t, 210, y + 26, 760, 60, { weight: 700, size: 36, vAlign: "middle" });
      });
      c.box(80, 880, 920, 2, { fill: "#dddddd" });
      c.profile(80, 940, 920, false);
      return done(c, PAPER, "dark", null);
    },
  },
  {
    id: "last-photo-glass",
    kind: "last",
    name: "사진 + 글래스 카드",
    desc: "사진 위 큰 문구와 반투명 프로필 카드",
    photo: true,
    fields: [
      { key: "text", desc: "큰 마무리 문구. 정확히 3줄(\\n), 한 줄 5~9자", max: 27 },
      { key: "guide", desc: "카드 위 한 줄 안내 (예: '더 많은 글은 프로필에서')", max: 22 },
    ],
    sample: { text: "이건\n마지막 장\n입니다", guide: "이건 안내 한 줄입니다" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: "linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.2) 45%, rgba(0,0,0,0.85) 100%)" });
      c.text("text", "title", S(f.text), 80, 110, 920, 420, { ...H1, size: 88, color: "#ffffff" });
      c.text("guide", "subtitle", S(f.guide), 80, 1010, 920, 50, { weight: 700, size: 30, color: "#ffffff" });
      c.box(80, 1080, 920, 170, { fill: "rgba(255,255,255,0.16)", border: "rgba(255,255,255,0.35)", bw: 2, radius: 28 });
      c.profile(115, 1115, 850, true);
      return done(c, "#111111", "light");
    },
  },
  {
    id: "last-black-profile",
    kind: "last",
    name: "블랙 프로필",
    desc: "검정 바탕, 가운데 큰 프로필과 팔로우",
    photo: false,
    fields: [{ key: "text", desc: "마무리 문구. 정확히 2줄(\\n), 한 줄 7~13자", max: 28 }],
    sample: { text: "이건\n마지막 장입니다" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("text", "title", S(f.text), 80, 200, 920, 220, { ...H1, size: 62, color: "#ffffff", align: "center", vAlign: "middle" });
      c.avatar(450, 520, 180, (ctx.handle.replace(/^@/, "")[0] ?? "돈").toUpperCase());
      c.text(undefined, "handle", ctx.handle, 80, 730, 920, 70, { weight: 800, size: 46, color: "#ffffff", align: "center" });
      c.text(undefined, "other", "팔로우", 340, 830, 400, 84, {
        weight: 800, size: 34, color: INK, align: "center", vAlign: "middle", lineHeight: 1,
        box: true, boxColor: "#ffffff", boxOpacity: 100, boxRadius: 16, boxPad: 0,
      });
      return done(c, "#000000", "light", null);
    },
  },
  {
    id: "last-photo-card",
    kind: "last",
    name: "사진 + 화이트 카드",
    desc: "사진 위 흰 프로필 카드와 문구",
    photo: true,
    fields: [{ key: "text", desc: "마무리 문구. 정확히 3줄(\\n), 한 줄 5~10자", max: 30 }],
    sample: { text: "이건\n마지막 장\n입니다" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: "rgba(0,0,0,0.55)" });
      c.box(140, 470, 800, 170, { fill: "#ffffff", radius: 28 });
      c.profile(175, 505, 730, false);
      c.text("text", "title", S(f.text), 80, 700, 920, 300, { ...H1, size: 56, color: "#ffffff", align: "center", lineHeight: 1.45 });
      return done(c, "#111111", "light");
    },
  },
  {
    id: "last-black-text",
    kind: "last",
    name: "블랙 마무리 문구",
    desc: "큰 문구와 설명, 아래 프로필 카드",
    photo: false,
    fields: [
      { key: "text", desc: "큰 마무리 문구. 정확히 3줄(\\n), 한 줄 4~8자", max: 24 },
      { key: "desc", desc: "짧은 설명 2줄(\\n)", max: 40 },
    ],
    sample: { text: "이건\n마지막 장\n입니다", desc: "이건 짧은 설명입니다." },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("text", "title", S(f.text), 80, 130, 920, 420, { ...H1, size: 100, color: "#ffffff", lineHeight: 1.2 });
      c.text("desc", "body", S(f.desc), 80, 580, 920, 130, { size: 34, color: "rgba(255,255,255,0.65)" });
      c.box(80, 1080, 920, 170, { fill: "#1c1c1e", radius: 28 });
      c.profile(115, 1115, 850, true);
      return done(c, "#0b0b0b", "light", null);
    },
  },
];

export const LAYOUTS: LayoutDef[] = [...COVERS, ...INNERS, ...LASTS];
const BY_ID = new Map(LAYOUTS.map((l) => [l.id, l]));
export const getLayout = (id?: string | null) => (id ? BY_ID.get(id) : undefined);
export const layoutsOf = (kind: LayoutKind) => LAYOUTS.filter((l) => l.kind === kind);

/** 칸 값 정리: 목록은 정해진 개수로, 글은 문자열로 */
export function normalizeFields(def: LayoutDef, raw: Fields): Fields {
  const out: Fields = {};
  for (const f of def.fields) {
    const v = raw[f.key];
    out[f.key] = f.count ? L(v, f.count).map((s) => s.trim()) : S(v).trim();
  }
  return out;
}

/** AI 없이 나눌 때 비워 두는 칸 (댓글 말풍선·가격표 — 본문 줄을 엉뚱하게 가져가지 않게) */
const OPTIONAL_KEYS = new Set(["cta", "tag", "was", "off", "price"]);

/** AI 없이 글을 칸에 나눠 넣기 (AI가 실패했을 때) */
export function roughFields(def: LayoutDef, text: string): Fields {
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const out: Fields = {};
  let i = 0;
  for (const f of def.fields) {
    if (f.count) {
      out[f.key] = Array.from({ length: f.count }, () => lines[i++] ?? "");
    } else if (f.key === "hl" || f.key === "num" || OPTIONAL_KEYS.has(f.key)) {
      out[f.key] = f.key === "num" ? "1" : "";
    } else {
      out[f.key] = lines[i++] ?? "";
    }
  }
  // 남은 글은 가장 긴 칸(본문)에 붙인다
  const rest = lines.slice(i).join("\n");
  const big = [...def.fields].filter((f) => !f.count).sort((a, b) => b.max - a.max)[0];
  if (rest && big) out[big.key] = [S(out[big.key]), rest].filter(Boolean).join("\n");
  return out;
}

/** 슬라이드 글 상자에서 고친 글을 칸 값에 다시 넣는다 ("items.2" 같은 주소) */
export function setField(fields: Fields, path: string, value: string): Fields {
  const [key, idx] = path.split(".");
  if (idx === undefined) return { ...fields, [key]: value };
  const arr = Array.isArray(fields[key]) ? [...(fields[key] as string[])] : [];
  arr[Number(idx)] = value;
  return { ...fields, [key]: arr };
}
