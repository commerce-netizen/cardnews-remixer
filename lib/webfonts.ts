import { jua, pretendard } from "./fonts";

/**
 * 템플릿에서 고를 수 있는 글꼴 목록.
 *
 * 내장 글꼴(주아·프리텐다드)은 앱에 들어 있고, 나머지는 jsDelivr CDN(fonts-archive)에서
 * 그때그때 내려받는다. 모든 주소는 실제로 200을 확인한 것이고, CORS가 열려 있어
 * PNG 저장(html-to-image)할 때 글꼴을 그림 안에 심을 수 있다.
 *
 * 쓰는 글꼴만 내려받도록 @font-face는 미리 넣지 않고 ensureFont()로 그때 넣는다.
 */

const FALLBACK = `-apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;

const cdn = (repo: string, file: string) => `https://cdn.jsdelivr.net/gh/fonts-archive/${repo}/${file}`;

export type FontOption = {
  id: string;
  /** 사용자에게 보여 줄 이름 */
  label: string;
  /** CSS font-family 값 (바로 style에 넣어 쓴다) */
  stack: string;
  /** CDN 글꼴일 때만. 굵기는 파일 자체가 가진 굵기라 normal로 선언한다 */
  face?: { family: string; url: string };
};

function cdnFont(id: string, label: string, family: string, repo: string, file: string): FontOption {
  return { id, label, stack: `"${family}", ${FALLBACK}`, face: { family, url: cdn(repo, file) } };
}

export const FONTS: FontOption[] = [
  { id: "jua", label: "주아 — 둥글고 굵은 고딕 (기본)", stack: `${jua.style.fontFamily}, ${FALLBACK}` },
  cdnFont("dohyeon", "도현 — 아주 굵은 제목용", "BM DOHYEON", "BMDOHYEON", "BMDOHYEON.woff2"),
  cdnFont("gmarket", "지마켓 산스 — 단단한 고딕", "Gmarket Sans", "GmarketSans", "GmarketSansBold.woff2"),
  cdnFont("ganpan", "KCC 간판체 — 간판 글씨", "KCC Ganpan", "KCCGanpan", "KCC-Ganpan.woff2"),
  cdnFont("gw-power", "강원교육 파워 — 힘 있는 제목", "GangwonEdu Power", "GangwonEduPower", "GangwonEduPower.woff2"),
  cdnFont("gw-modu", "강원교육 모두 — 또렷한 고딕", "GangwonEdu Modu", "GangwonEduModu", "GangwonEduModu-Bold.woff2"),
  cdnFont("gw-saeeum", "강원교육 새움 — 동글동글", "GangwonEdu Saeeum", "GangwonEduSaeeum", "GangwonEduSaeeum.woff2"),
  cdnFont("gw-hyeonok", "강원교육 현옥샘 — 손글씨", "GangwonEdu Hyeonok", "GangwonEduHyeonok", "GangwonEduHyeonok.woff2"),
  cdnFont("dovemayo", "비둘기마요 — 부드러운 고딕", "Dovemayo Gothic", "DovemayoGothic", "Dovemayo-Gothic.woff2"),
  cdnFont("ohsquare-air", "카페24 오스퀘어 에어 — 가는 고딕", "Cafe24 Ohsquare Air", "Cafe24OhsquareAir", "Cafe24OhsquareAir.woff2"),
  cdnFont("maruburi", "마루부리 — 단정한 명조", "Maru Buri", "MaruBuri", "MaruBuri-Bold.woff2"),
  cdnFont("bombaram", "HS봄바람 3.0 — 손글씨", "HSBombaram3.0", "HSBombaram3.0", "HSBombaram3.0-Regular.woff2"),
  { id: "pretendard", label: "프리텐다드 — 깔끔한 고딕", stack: `${pretendard.style.fontFamily}, ${FALLBACK}` },
  { id: "helvetica", label: "Helvetica Neue — 영문용", stack: `"Helvetica Neue", Helvetica, Arial, ${FALLBACK}` },
];

const BY_ID = new Map(FONTS.map((f) => [f.id, f]));

export const DEFAULT_FONT_ID = "jua";

export function getFont(id: string): FontOption {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_FONT_ID)!;
}

/** style에 바로 넣는 font-family 값 */
export function fontStack(id: string): string {
  return getFont(id).stack;
}

const injected = new Set<string>();

/** 이 글꼴의 @font-face를 문서에 한 번만 넣는다 (PNG 저장 때도 이 규칙을 보고 글꼴을 심는다) */
export function ensureFont(id: string): void {
  if (typeof document === "undefined") return;
  const font = getFont(id);
  if (!font.face || injected.has(font.id)) return;
  injected.add(font.id);
  const style = document.createElement("style");
  style.dataset.webfont = font.id;
  style.textContent =
    `@font-face{font-family:"${font.face.family}";font-style:normal;font-weight:normal;` +
    `font-display:swap;src:url("${font.face.url}") format("woff2");}`;
  document.head.appendChild(style);
}

/** 글꼴을 내려받아 쓸 준비가 될 때까지 기다린다 (미리보기·PNG 저장 전에 호출) */
export async function loadFonts(ids: string[], sample = "가나다라마바사 ABC 123"): Promise<void> {
  if (typeof document === "undefined") return;
  const unique = [...new Set(ids)];
  unique.forEach(ensureFont);
  await Promise.all(
    unique.map(async (id) => {
      const font = getFont(id);
      if (!font.face) return;
      try {
        await document.fonts.load(`80px "${font.face.family}"`, sample);
      } catch {
        // 글꼴을 못 내려받아도 기본 글꼴로 그려지면 되니 막지 않는다
      }
    }),
  );
}
