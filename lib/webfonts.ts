import { jua, pretendard } from "./fonts";
import CATALOG from "./font-catalog.json";

/**
 * 고를 수 있는 글꼴 목록.
 *
 * - 내장 글꼴(주아·프리텐다드)은 앱에 들어 있다.
 * - 나머지 한글 글꼴 500여 개는 github.com/fonts-archive 전체 목록(lib/font-catalog.json,
 *   scripts/fonts/build-catalog.mjs로 다시 만들 수 있음)이고, jsDelivr CDN에서 그때그때 내려받는다.
 *   CORS가 열려 있어 PNG 저장(html-to-image)할 때 글꼴을 그림 안에 심을 수 있다.
 *
 * 쓰는 글꼴·굵기만 내려받도록 @font-face는 미리 넣지 않고 ensureFont()로 그때 넣는다.
 */

const FALLBACK = `-apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
const CDN = "https://cdn.jsdelivr.net/gh/fonts-archive";

export type FontCategory = "고딕" | "명조" | "손글씨" | "디자인" | "기본";

export type FontFace = { w: number; url: string };

export type FontOption = {
  id: string;
  /** 사용자에게 보여 줄 이름 */
  label: string;
  cat: FontCategory;
  /** CSS font-family 값 (바로 style에 넣어 쓴다) */
  stack: string;
  /** CDN 글꼴일 때만: 글꼴 이름과 굵기별 파일 */
  family?: string;
  faces?: FontFace[];
  /** 굵기 자유 조절 가능(가변 글꼴·시스템 글꼴) */
  anyWeight?: boolean;
};

type CatalogEntry = { id: string; label: string; family: string; cat: FontCategory; faces: { w: number; f: string }[] };

function cdnFont(e: CatalogEntry): FontOption {
  return {
    id: e.id,
    label: e.label,
    cat: e.cat,
    family: e.family,
    stack: `"${e.family}", ${FALLBACK}`,
    faces: e.faces.map((x) => ({ w: x.w, url: `${CDN}/${e.id}/${x.f}` })),
  };
}

/** 예전 템플릿에 저장된 글꼴 (파일 하나를 보통 굵기로 썼다). 저장된 템플릿 모양이 바뀌지 않게 그대로 둔다 */
function legacy(id: string, label: string, family: string, repo: string, file: string): FontOption {
  const fam = `L ${family}`;
  return { id, label, cat: "기본", family: fam, stack: `"${fam}", ${FALLBACK}`, faces: [{ w: 400, url: `${CDN}/${repo}/${file}` }] };
}

const BUILTIN: FontOption[] = [
  { id: "jua", label: "주아 — 둥글고 굵은 고딕 (기본)", cat: "기본", stack: `${jua.style.fontFamily}, ${FALLBACK}` },
  { id: "pretendard", label: "프리텐다드 — 깔끔한 고딕", cat: "기본", stack: `${pretendard.style.fontFamily}, ${FALLBACK}`, anyWeight: true },
  legacy("dohyeon", "도현 — 아주 굵은 제목용", "BM DOHYEON", "BMDOHYEON", "BMDOHYEON.woff2"),
  legacy("gmarket", "지마켓 산스 굵게 — 단단한 고딕", "Gmarket Sans", "GmarketSans", "GmarketSansBold.woff2"),
  legacy("ganpan", "KCC 간판체 — 간판 글씨", "KCC Ganpan", "KCCGanpan", "KCC-Ganpan.woff2"),
  legacy("gw-power", "강원교육 튼튼 — 힘 있는 제목", "GangwonEdu Power", "GangwonEduPower", "GangwonEduPower.woff2"),
  legacy("gw-modu", "강원교육 모두 — 또렷한 고딕", "GangwonEdu Modu", "GangwonEduModu", "GangwonEduModu-Bold.woff2"),
  legacy("gw-saeeum", "강원교육 새음 — 동글동글", "GangwonEdu Saeeum", "GangwonEduSaeeum", "GangwonEduSaeeum.woff2"),
  legacy("gw-hyeonok", "강원교육 현옥샘 — 손글씨", "GangwonEdu Hyeonok", "GangwonEduHyeonok", "GangwonEduHyeonok.woff2"),
  legacy("dovemayo", "둘기마요 — 부드러운 고딕", "Dovemayo Gothic", "DovemayoGothic", "Dovemayo-Gothic.woff2"),
  legacy("ohsquare-air", "카페24 아네모네 에어 — 가는 고딕", "Cafe24 Ohsquare Air", "Cafe24OhsquareAir", "Cafe24OhsquareAir.woff2"),
  legacy("maruburi", "마루부리 굵게 — 단정한 명조", "Maru Buri", "MaruBuri", "MaruBuri-Bold.woff2"),
  legacy("bombaram", "HS봄바람 — 손글씨", "HSBombaram3.0", "HSBombaram3.0", "HSBombaram3.0-Regular.woff2"),
  { id: "helvetica", label: "Helvetica Neue — 영문용", cat: "기본", stack: `"Helvetica Neue", Helvetica, Arial, ${FALLBACK}`, anyWeight: true },
];

export const FONTS: FontOption[] = [...BUILTIN, ...(CATALOG as CatalogEntry[]).map(cdnFont)];
export const FONT_CATEGORIES: FontCategory[] = ["기본", "고딕", "명조", "손글씨", "디자인"];

const BY_ID = new Map(FONTS.map((f) => [f.id, f]));

export const DEFAULT_FONT_ID = "jua";

export function getFont(id: string): FontOption {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_FONT_ID)!;
}

export const hasFont = (id: string) => BY_ID.has(id);

/** style에 바로 넣는 font-family 값 */
export function fontStack(id: string): string {
  return getFont(id).stack;
}

/** 이 글꼴이 가진 굵기 중 원하는 굵기에 가장 가까운 것 (파일 하나짜리 글꼴은 그 굵기 그대로) */
export function snapWeight(id: string, want = 400): number {
  const f = getFont(id);
  if (!f.faces) return f.anyWeight ? want : 400;
  return f.faces.reduce((best, x) => (Math.abs(x.w - want) < Math.abs(best - want) ? x.w : best), f.faces[0].w);
}

/** 고를 수 있는 굵기 목록 */
export function fontWeights(id: string): number[] {
  const f = getFont(id);
  if (f.faces) return f.faces.map((x) => x.w);
  return f.anyWeight ? [300, 400, 500, 700, 800, 900] : [400];
}

export const WEIGHT_LABEL: Record<number, string> = {
  100: "아주 가늘게", 200: "더 가늘게", 300: "가늘게", 400: "보통", 500: "조금 굵게",
  600: "굵게", 700: "더 굵게", 800: "아주 굵게", 900: "가장 굵게",
};

const injected = new Set<string>();

export type FontNeed = string | { id: string; w?: number };

/** 이 글꼴(그 굵기)의 @font-face를 문서에 한 번만 넣는다 (PNG 저장 때도 이 규칙을 보고 글꼴을 심는다) */
export function ensureFont(need: FontNeed): void {
  if (typeof document === "undefined") return;
  const id = typeof need === "string" ? need : need.id;
  const font = getFont(id);
  if (!font.faces || !font.family) return;
  const w = snapWeight(font.id, typeof need === "string" ? 400 : need.w);
  const face = font.faces.find((x) => x.w === w) ?? font.faces[0];
  const key = `${font.id}@${face.w}`;
  if (injected.has(key)) return;
  injected.add(key);
  const style = document.createElement("style");
  style.dataset.webfont = key;
  style.textContent =
    `@font-face{font-family:"${font.family}";font-style:normal;font-weight:${face.w};` +
    `font-display:swap;src:url("${face.url}") format("woff2");}`;
  document.head.appendChild(style);
}

/** 글꼴을 내려받아 쓸 준비가 될 때까지 기다린다 (미리보기·PNG 저장 전에 호출) */
export async function loadFonts(needs: FontNeed[], sample = "가나다라마바사 ABC 123"): Promise<void> {
  if (typeof document === "undefined") return;
  const seen = new Set<string>();
  const list = needs
    .map((n) => (typeof n === "string" ? { id: n, w: 400 } : { id: n.id, w: n.w ?? 400 }))
    .filter((n) => {
      const k = `${getFont(n.id).id}@${snapWeight(n.id, n.w)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  list.forEach(ensureFont);
  await Promise.all(
    list.map(async (n) => {
      const font = getFont(n.id);
      if (!font.faces || !font.family) return;
      try {
        await document.fonts.load(`${snapWeight(n.id, n.w)} 80px "${font.family}"`, sample);
      } catch {
        // 글꼴을 못 내려받아도 기본 글꼴로 그려지면 되니 막지 않는다
      }
    }),
  );
}
