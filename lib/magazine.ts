/**
 * 매거진형 레이아웃 — 표지(cover)·속지(inner)·마지막 장(last) 양식.
 *
 * 레이아웃 하나 = 칸(field) 목록 + 그 칸들로 슬라이드를 그리는 build().
 * build()는 바탕색·사진 자리·도형(띠·박스·체크칸·프로필)·글 상자들을 만든다.
 * 글 상자는 기존 편집기 그대로 고치고·옮기고·글꼴을 바꿀 수 있다.
 * AI는 장마다 내용을 이 칸들에 나눠 쓴다(/api/fill).
 *
 * 좌표는 1080×1350(4:5) 기준 px로 적고, 슬라이드 높이에 맞춰 세로만 늘이거나 줄인다.
 */
import { BASE_STYLE, SLIDE_W, blockId, type BlockStyle, type TextBlock, type TextRole } from "./layout";

export type LayoutKind = "cover" | "inner" | "last";
export const KIND_LABEL: Record<LayoutKind, string> = { cover: "표지", inner: "속지", last: "마지막 장" };

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
const SHADE_BOTTOM = "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 62%, rgba(0,0,0,0.9) 100%)";
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
      blocks.push({
        ...TEXT_BASE,
        ...st,
        ...pct(x, y, w, h),
        id: blockId(),
        role,
        original: "",
        text,
        accent: "",
        field,
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
        accent: "",
        field,
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

// ── 표지 ──────────────────────────────────────────────
const COVERS: LayoutDef[] = [
  {
    id: "cover-photo-bottom",
    kind: "cover",
    name: "사진 + 아래 큰 제목",
    desc: "사진 아래쪽을 어둡게, 큰 제목 세 줄",
    photo: true,
    fields: [{ key: "title", desc: "표지 제목. 정확히 3줄(\\n), 한 줄 7~13자, 궁금하게", max: 40 }],
    sample: { title: "요즘 가장 많이 찾는\n집밥 반찬 공식\n지금 공개합니다" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: SHADE_BOTTOM });
      c.text("title", "title", S(f.title), 80, 780, 920, 440, { ...H1, size: 92, color: "#ffffff", vAlign: "bottom" });
      return done(c, "#1d1d1d", "light");
    },
  },
  {
    id: "cover-photo-center",
    kind: "cover",
    name: "사진 + 가운데 제목",
    desc: "작은 머리글, 가운데 제목, 부제, 출처",
    photo: true,
    fields: [
      { key: "kicker", desc: "제목 위 작은 머리글 한 줄 (분야·시리즈명)", max: 16 },
      { key: "title", desc: "가운데 큰 제목. 정확히 2줄(\\n), 한 줄 6~11자", max: 24 },
      { key: "subtitle", desc: "부제 한 줄", max: 26 },
      { key: "source", desc: "출처나 기준 한 줄 (모르면 빈 문자열)", max: 20 },
    ],
    sample: { kicker: "에디터 노트", title: "가운데 제목이\n두 줄 들어갑니다", subtitle: "이 줄에는 부제를 한 줄로 넣습니다", source: "출처나 계정" },
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
    name: "사진 + 가운데 큰 제목 + 로고",
    desc: "가운데 아래 큰 제목 두 줄, 맨 아래 내 계정",
    photo: true,
    fields: [{ key: "title", desc: "큰 제목. 정확히 2줄(\\n), 한 줄 6~11자", max: 24 }],
    sample: { title: "큰 제목 두 줄과\n가운데 정렬 썸네일" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: SHADE_BOTTOM });
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
    name: "검정 바탕 + 큰 글씨",
    desc: "위쪽 사진이 검정으로 스며들고, 아래쪽 아주 큰 제목",
    photo: true,
    fields: [{ key: "title", desc: "아주 큰 제목. 정확히 2줄(\\n), 한 줄 5~9자", max: 20 }],
    sample: { title: "큰 글씨 두 줄\n썸네일 예시" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 820, { fill: "linear-gradient(180deg, rgba(0,0,0,0) 45%, #000 100%)" });
      c.text("title", "title", S(f.title), 80, 820, 920, 400, { ...H1, size: 112, color: "#ffffff", vAlign: "bottom", lineHeight: 1.18 });
      return done(c, "#000000", "light", c.rect(0, 0, 1080, 820));
    },
  },
  {
    id: "cover-color-top",
    kind: "cover",
    name: "색 바탕 + 위 제목",
    desc: "강조색 바탕, 왼쪽 위 제목, 아래 사진",
    photo: true,
    fields: [{ key: "title", desc: "제목. 정확히 2줄(\\n), 한 줄 7~13자", max: 28 }],
    sample: { title: "위쪽 작은 제목 두 줄\n썸네일 예시입니다" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("title", "title", S(f.title), 80, 110, 920, 280, { ...H1, size: 80, color: "#ffffff" });
      return done(c, ctx.accent, "light", c.rect(80, 470, 920, 760));
    },
  },
  {
    id: "cover-book",
    kind: "cover",
    name: "책 표지형",
    desc: "종이 바탕, 굵은 띠 사이에 명조 제목 세 줄",
    photo: false,
    fields: [
      { key: "kicker", desc: "머리글 한 줄 (시리즈명·호수, 예: '돈작가 노트 001')", max: 18 },
      { key: "title", desc: "명조 제목. 정확히 3줄(\\n), 한 줄 4~9자", max: 27 },
    ],
    sample: { kicker: "머리글 한 줄 001", title: "책 제목을\n세 줄로\n넣는 표지 예시" },
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
];

// ── 속지 ──────────────────────────────────────────────
const INNERS: LayoutDef[] = [
  {
    id: "info-table",
    kind: "inner",
    name: "정보 표",
    desc: "표 제목, 한 줄 소개, 항목 이름 + 내용 네 줄",
    photo: false,
    fields: [
      { key: "title", desc: "표 제목. 2줄(\\n)", max: 24 },
      { key: "intro", desc: "제목 아래 한 줄 소개", max: 34 },
      { key: "labels", desc: "항목 이름 (2~5자)", max: 6, count: 4 },
      { key: "contents", desc: "항목 내용. '· '로 시작하는 1~2줄(\\n)", max: 44, count: 4 },
    ],
    sample: {
      title: "표 제목을\n두 줄로 넣습니다", intro: "제목 아래에 한 줄 소개를 적습니다.",
      labels: ["항목 이름", "항목 이름", "항목 이름", "항목 이름"],
      contents: ["· 항목 내용을 적습니다\n· 두세 줄까지 들어갑니다", "· 항목 내용을 적습니다", "· 항목 내용을 적습니다\n· 형광펜도 쓸 수 있습니다", "· 항목 내용을 적습니다"],
    },
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
    name: "번호 목록",
    desc: "번호 붙은 항목 여덟 줄, 강조할 줄은 색으로",
    photo: false,
    fields: [
      { key: "title", desc: "목록 제목 한 줄", max: 22 },
      { key: "items", desc: "항목 한 줄 (번호 없이)", max: 24, count: 8 },
      { key: "hl", desc: "색으로 강조할 항목 번호들 (예: '3,4'). 없으면 빈 문자열", max: 10 },
    ],
    sample: {
      title: "이 자리에 목록 제목",
      items: ["첫 번째 항목을 적습니다", "항목을 한 줄씩 적습니다", "강조할 줄은 색을 바꿉니다", "이 줄도 색을 바꿨습니다", "다섯 번째 항목입니다", "여섯 번째 항목입니다", "일곱 번째 항목입니다", "여덟 번째 항목입니다"],
      hl: "3,4",
    },
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
    desc: "제목, 노란 띠, 체크칸 여섯 줄",
    photo: false,
    fields: [
      { key: "title", desc: "제목. 2줄(\\n), 한 줄 4~9자", max: 20 },
      { key: "tag", desc: "띠 안 짧은 안내 (예: '하나씩 확인해 보세요')", max: 14 },
      { key: "items", desc: "확인할 일 한 줄", max: 24, count: 6 },
    ],
    sample: {
      title: "떠나기 전\n체크리스트", tag: "하나씩 확인해 보세요",
      items: Array(6).fill("확인할 일을 한 줄로 적습니다"),
    },
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
    name: "순위표",
    desc: "TOP 5 제목, 주제 띠, 순위 번호 + 이름 + 이유",
    photo: false,
    fields: [
      { key: "title", desc: "순위표 제목 한 줄 (예: '자취생 필수템 TOP 5')", max: 20 },
      { key: "tag", desc: "띠 안 해시태그 1~2개", max: 14 },
      { key: "names", desc: "순위 항목 이름", max: 18, count: 5 },
      { key: "reasons", desc: "그 순위인 이유 한 줄", max: 28, count: 5 },
    ],
    sample: {
      title: "이 자리에 TOP 5", tag: "#주제 #순위",
      names: ["1위 이름을 적습니다", "2위 이름을 적습니다", "3위 이름을 적습니다", "4위 이름을 적습니다", "5위 이름을 적습니다"],
      reasons: Array(5).fill("이유를 한 줄 적습니다"),
    },
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
    name: "두 칸 비교표",
    desc: "A·B 두 가지를 항목별로 나란히 비교",
    photo: false,
    fields: [
      { key: "title", desc: "비교 제목 한 줄", max: 18 },
      { key: "a", desc: "비교 대상 A 이름", max: 10 },
      { key: "b", desc: "비교 대상 B 이름", max: 10 },
      { key: "labels", desc: "비교 항목 이름 (2~4자, 예: 가격·크기·장점·단점)", max: 5, count: 4 },
      { key: "as", desc: "A의 내용. 1~2줄(\\n)", max: 22, count: 4 },
      { key: "bs", desc: "B의 내용. 1~2줄(\\n)", max: 22, count: 4 },
    ],
    sample: {
      title: "둘 중 뭘 살까 비교합니다", a: "A", b: "B", labels: ["가격", "크기", "장점", "단점"],
      as: Array(4).fill("A의 내용을\n두 줄로 적습니다"), bs: Array(4).fill("B의 내용을\n두 줄로 적습니다"),
    },
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
    name: "좋은 점·아쉬운 점",
    desc: "위 사진, 좋은 점 세 줄, 아쉬운 점 세 줄",
    photo: true,
    fields: [
      { key: "goods", desc: "좋은 점 한 줄", max: 26, count: 3 },
      { key: "bads", desc: "아쉬운 점 한 줄", max: 26, count: 3 },
    ],
    sample: { goods: Array(3).fill("좋은 점을 한 줄로 적습니다"), bads: Array(3).fill("아쉬운 점을 한 줄로 적습니다") },
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
    name: "하루 일정표",
    desc: "시간 + 할 일 + 짧은 설명이 세로 선으로 이어짐",
    photo: false,
    fields: [
      { key: "title", desc: "일정 제목 한 줄 (예: '성수동 하루 코스')", max: 18 },
      { key: "tag", desc: "띠 안 해시태그 1~2개", max: 14 },
      { key: "times", desc: "시간이나 순서 (예: '오전 9시', 'STEP 1')", max: 8, count: 5 },
      { key: "places", desc: "할 일이나 장소", max: 18, count: 5 },
      { key: "descs", desc: "짧은 설명 한 줄", max: 28, count: 5 },
    ],
    sample: {
      title: "하루 코스 제목", tag: "#코스 #하루", times: ["오전 9시", "오전 11시", "오후 1시", "오후 4시", "저녁 7시"],
      places: Array(5).fill("할 일이나 장소"), descs: Array(5).fill("짧은 설명을 한 줄로 적습니다."),
    },
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
    name: "질문 띠 Q&A",
    desc: "색 띠 질문 세 개와 그 답",
    photo: false,
    fields: [
      { key: "qs", desc: "질문 한 줄 (Q 번호 없이)", max: 22, count: 3 },
      { key: "as", desc: "답 2~3줄 분량의 문장", max: 80, count: 3 },
    ],
    sample: { qs: Array(3).fill("질문을 적습니다"), as: Array(3).fill("답변을 적습니다. 두세 줄 정도로 편하게 풀어서 적으면 읽기 좋습니다.") },
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
    name: "인물 소개표",
    desc: "왼쪽 인물 사진, 이름·태그·소개, 아래 항목 네 줄",
    photo: true,
    fields: [
      { key: "name", desc: "이름 (2줄 가능, \\n)", max: 14 },
      { key: "tag", desc: "띠 안 해시태그 (예: '#직업 #소개')", max: 14 },
      { key: "intro", desc: "그 사람 소개 2~3줄", max: 60 },
      { key: "labels", desc: "항목 이름 (예: 하는 일·좋아하는 것·한마디)", max: 6, count: 4 },
      { key: "contents", desc: "항목 내용 한 줄", max: 26, count: 4 },
    ],
    sample: {
      name: "이름을\n적습니다", tag: "#직업 #소개", intro: "한 사람을 소개하는 글을 세 줄 안쪽으로 적습니다. 어떤 일을 하는지 적어요.",
      labels: ["하는 일", "좋아하는 것", "한마디", "연락처"], contents: Array(4).fill("내용을 한두 줄로 적습니다."),
    },
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
    name: "제품 정보표",
    desc: "위 제품 사진, 이름 띠, 가격·구매처·추천, 검정 한 줄 평",
    photo: true,
    fields: [
      { key: "name", desc: "제품 이름 한 줄", max: 20 },
      { key: "labels", desc: "항목 이름 (예: 가격·구매처·추천)", max: 5, count: 3 },
      { key: "contents", desc: "항목 내용 한 줄 (모르는 가격은 지어내지 말 것)", max: 26, count: 3 },
      { key: "quote", desc: "한 줄 평. 1~2줄(\\n)", max: 44 },
    ],
    sample: {
      name: "제품 이름을 적습니다", labels: ["가격", "구매처", "추천"], contents: Array(3).fill("내용을 한 줄로 적습니다."),
      quote: "한 줄 평을 이 자리에 적습니다.\n두 줄까지 넣을 수 있어요.",
    },
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
    name: "사진 + 소제목 + 본문",
    desc: "위 사진, 아래 굵은 소제목과 본문 문단",
    photo: true,
    fields: [
      { key: "subtitle", desc: "소제목 한 줄", max: 20 },
      { key: "body", desc: "본문 2문단(문단 사이 빈 줄 \\n\\n), 4~6줄 분량", max: 160 },
    ],
    sample: {
      subtitle: "소제목을 넣는 자리", body: "이 부분에는 본문 문단을 적습니다. 위쪽 사진 칸에는 내용과 어울리는 사진을 넣어 주세요.\n\n문단 사이는 한 줄을 띄우면 읽기 편합니다.",
    },
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
    name: "넘버링",
    desc: "색 번호 소제목 + 설명 (팁·방법을 하나씩)",
    photo: false,
    fields: [
      { key: "num", desc: "번호 (이 장의 순서, 숫자만)", max: 2 },
      { key: "heading", desc: "소제목 한 줄", max: 18 },
      { key: "body", desc: "설명 문단 3~6줄 분량", max: 170 },
    ],
    sample: {
      num: "1", heading: "번호와 소제목을 넣는 자리",
      body: "이 부분에는 소제목에 대한 설명을 적습니다. 번호를 매긴 팁이나 방법을 하나씩 소개할 때 쓰는 양식입니다.",
    },
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
    name: "본문 넘버링 (어두운)",
    desc: "사진 위 어두운 바탕, 번호 소제목 + 설명",
    photo: true,
    fields: [
      { key: "num", desc: "번호 (숫자만)", max: 2 },
      { key: "heading", desc: "소제목 한 줄", max: 18 },
      { key: "body", desc: "설명 3~4줄 분량", max: 110 },
    ],
    sample: { num: "1", heading: "번호와 소제목을 넣는 자리", body: "이 부분에는 소제목에 대한 설명을 적습니다. 어두운 바탕 위에 밝은 글씨로 들어가며, 서너 줄 정도가 가장 보기 좋습니다." },
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
    name: "한 장 글",
    desc: "검정 바탕 가운데 글 한 편",
    photo: false,
    fields: [{ key: "text", desc: "한 편의 글. 2~3문단(빈 줄 \\n\\n로 구분), 문단마다 2줄", max: 160 }],
    sample: { text: "“이 템플릿은 검정 바탕에\n글 한 편을 가운데 정렬로 담는 양식입니다.\n\n좋아하는 문장이나 짧은 글을\n이 자리에 넣어 주세요.”" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("text", "body", S(f.text), 100, 260, 880, 830, { weight: 700, size: 44, color: "#ffffff", align: "center", vAlign: "middle", lineHeight: 1.6 });
      return done(c, "#000000", "light", null);
    },
  },
  {
    id: "essay",
    kind: "inner",
    name: "본문",
    desc: "첫 문장 강조 + 긴 본문 (한 장에 열 줄 안팎)",
    photo: false,
    fields: [
      { key: "lead", desc: "글을 여는 첫 문장 (따옴표 없이)", max: 30 },
      { key: "body", desc: "긴 본문 2문단(\\n\\n), 8~10줄 분량", max: 260 },
    ],
    sample: {
      lead: "이 자리에는 글을 여는 첫 문장을 넣습니다.",
      body: "이 템플릿은 긴 글을 담는 본문 양식입니다. 한 장에 열 줄 안팎이 들어갑니다.\n\n글이 길어지면 다음 장으로 이어 쓰면 됩니다.",
    },
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
    name: "아이템 소개",
    desc: "번호 + 제품 이름, 가운데 사진, 한 줄 설명",
    photo: true,
    fields: [
      { key: "num", desc: "번호 두 자리 (예: '01')", max: 3 },
      { key: "name", desc: "아이템 이름 한 줄", max: 14 },
      { key: "quote", desc: "한 줄 설명 (따옴표 없이)", max: 22 },
      { key: "desc", desc: "소개 3~4줄 분량", max: 80 },
    ],
    sample: { num: "01", name: "제품 이름", quote: "이 자리에 한 줄 설명을 넣습니다", desc: "이 부분에는 제품 소개를 적습니다. 너무 길지 않게 서너 줄 정도가 가장 보기 좋습니다." },
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
    name: "띠 + 큰 사진 + 이유",
    desc: "질문형 제목 띠, 큰 사진, 이유 세 줄",
    photo: true,
    fields: [
      { key: "title", desc: "질문형 제목 한 줄 (예: '이걸 왜 샀을까?')", max: 18 },
      { key: "reasons", desc: "이유 한 줄", max: 28, count: 3 },
    ],
    sample: { title: "이걸 왜 샀을까?", reasons: ["첫 번째 이유를 한 줄로 적습니다.", "두 번째 이유를 한 줄로 적습니다.", "세 번째 이유를 한 줄로 적습니다."] },
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
    name: "어두운 번호 카드",
    desc: "위 사진, 아래 검정 칸에 번호·제목·설명",
    photo: true,
    fields: [
      { key: "num", desc: "번호 (숫자만)", max: 2 },
      { key: "title", desc: "한 줄 제목", max: 18 },
      { key: "desc", desc: "설명 2~3줄 분량", max: 70 },
    ],
    sample: { num: "1", title: "한 줄 제목을 넣는 자리", desc: "이 부분에는 설명을 두세 줄 적습니다. 위쪽 칸에는 사진을 넣어 주세요." },
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
    name: "공간 소개",
    desc: "사진 위 장소 이름, 가는 길, 공간 소개",
    photo: true,
    fields: [
      { key: "name", desc: "장소·공간 이름", max: 16 },
      { key: "way", desc: "가는 길이나 위치 한 줄 (모르면 분위기 한 줄)", max: 24 },
      { key: "intro", desc: "공간 소개 3~4줄 분량 (분위기·추천·좋은 시간)", max: 90 },
    ],
    sample: { name: "장소 이름을 넣는 자리", way: "가는 길을 한 줄로 적습니다", intro: "이 부분에는 공간에 대한 소개를 적습니다. 분위기, 추천 메뉴, 가기 좋은 시간처럼 가는 사람에게 도움이 되는 내용을 넣어 주세요." },
    build(f, ctx) {
      const c = canvas(ctx);
      c.box(0, 0, 1080, 1350, { fill: "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0.92) 100%)" });
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
    name: "음악·도서 소개",
    desc: "한 줄 문장, 가운데 표지 사진, 인용구와 출처",
    photo: true,
    fields: [
      { key: "line", desc: "소개하는 것에 대한 한 줄 문장. 2줄(\\n)", max: 36 },
      { key: "quote", desc: "속 한 구절이나 핵심 문장. 2줄(\\n), 따옴표 없이", max: 36 },
      { key: "credit", desc: "만든 사람 - 제목 (예: '저자 - 책 제목')", max: 26 },
    ],
    sample: { line: "이 자리에는 곡이나 책에 대한 한 줄 문장을\n두 줄로 적습니다.", quote: "가사나 책 속 한 구절을\n이 자리에 넣습니다", credit: "가수 - 노래 제목 / 저자 - 책 제목" },
    build(f, ctx) {
      const c = canvas(ctx);
      c.text("line", "subtitle", S(f.line), 100, 150, 880, 120, { weight: 700, size: 36, align: "center", lineHeight: 1.45 });
      c.text("quote", "body", ["“", S(f.quote), "”"], 100, 860, 880, 130, { weight: 700, size: 38, align: "center", lineHeight: 1.45 });
      c.text("credit", "source", S(f.credit), 100, 1000, 880, 60, { size: 28, color: MUTED, align: "center" });
      return done(c, PAPER, "dark", c.rect(290, 310, 500, 500));
    },
  },
];

// ── 마지막 장 ─────────────────────────────────────────
const LASTS: LayoutDef[] = [
  {
    id: "last-ask3",
    kind: "last",
    name: "부탁 세 가지 + 프로필",
    desc: "번호 붙은 세 줄 부탁, 아래 프로필 한 줄",
    photo: false,
    fields: [
      { key: "title", desc: "마무리 제목. 2줄(\\n), 한 줄 6~11자", max: 24 },
      { key: "asks", desc: "독자에게 부탁할 행동 한 줄 (저장·공유·팔로우·댓글 등)", max: 22, count: 3 },
    ],
    sample: { title: "도움이 됐다면\n이렇게 해 주세요", asks: ["저장해 두고 필요할 때 꺼내 보기", "필요한 친구에게 공유하기", "팔로우하고 다음 글 받아 보기"] },
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
    name: "사진 + 반투명 카드",
    desc: "배경 사진 위 큰 문구, 아래 반투명 프로필 카드",
    photo: true,
    fields: [
      { key: "text", desc: "큰 마무리 문구. 정확히 3줄(\\n), 한 줄 5~9자", max: 27 },
      { key: "guide", desc: "카드 위 한 줄 안내 (예: '더 많은 글은 프로필에서')", max: 22 },
    ],
    sample: { text: "이 자리에\n원하는 문구를\n넣어 주세요", guide: "카드 위에 한 줄 안내를 넣습니다" },
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
    name: "검정 바탕 + 큰 프로필",
    desc: "검정 바탕 위 문구, 가운데 큰 프로필과 팔로우 버튼",
    photo: false,
    fields: [{ key: "text", desc: "마무리 문구. 정확히 2줄(\\n), 한 줄 7~13자", max: 28 }],
    sample: { text: "이 자리에 원하는 문구를\n두 줄로 넣어 주세요" },
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
    name: "사진 + 흰 프로필 카드",
    desc: "배경 사진 위 흰 프로필 카드와 문구 세 줄",
    photo: true,
    fields: [{ key: "text", desc: "마무리 문구. 정확히 3줄(\\n), 한 줄 5~10자", max: 30 }],
    sample: { text: "이 자리에\n원하는 문구를\n넣어 주세요" },
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
    name: "검정 바탕 + 큰 문구",
    desc: "왼쪽 큰 문구와 설명, 아래 프로필 카드",
    photo: false,
    fields: [
      { key: "text", desc: "큰 마무리 문구. 정확히 3줄(\\n), 한 줄 4~8자", max: 24 },
      { key: "desc", desc: "짧은 설명 2줄(\\n)", max: 40 },
    ],
    sample: { text: "이 자리에\n원하는 문구를\n넣어 주세요", desc: "그 아래에는 짧은 설명을\n두 줄 정도로 적습니다." },
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

/** AI 없이 글을 칸에 나눠 넣기 (AI가 실패했을 때) */
export function roughFields(def: LayoutDef, text: string): Fields {
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const out: Fields = {};
  let i = 0;
  for (const f of def.fields) {
    if (f.count) {
      out[f.key] = Array.from({ length: f.count }, () => lines[i++] ?? "");
    } else if (f.key === "hl" || f.key === "num") {
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
