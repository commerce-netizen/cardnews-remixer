import type { DmContent } from "./dm";
import type { TextBlock } from "./layout";
import type { Fields, Rect, Shape } from "./magazine";

export type Slide = {
  /** 화면에 표시할 이미지 주소 (프록시 URL 또는 data URL). 없으면 글자만 있는 슬라이드 */
  image: string | null;
  /** 각색 전 원본 사진 — AI 사진으로 자동 교체됐을 때 되돌리기용 */
  sourceImage?: string | null;
  /** 원본 슬라이드에서 읽어낸 글 (참고용) */
  original: string;
  /** 높이 ÷ 폭 (4:5 = 1.25) */
  ratio: number;
  /** 사진이 없을 때 바탕색 */
  bg: string;
  /** 사진 위에 얹는 글 상자들 */
  blocks: TextBlock[];
  /** 템플릿 조합의 마지막 장 (AI가 쓰지 않는 고정 장 — 템플릿을 바꾸면 새로 붙는다) */
  fixedLast?: boolean;
  /** 양식 id (없으면 글 상자만 있는 기본 장) */
  layout?: string;
  /** 매거진 레이아웃 칸 값 (색만 바꿀 때 AI 없이 다시 그리는 데 씀) */
  fields?: Fields;
  /** 사진 자리 (undefined = 꽉 차게, null = 사진 안 씀) */
  photo?: Rect | null;
  /** 띠·박스·선·프로필 같은 도형 */
  shapes?: Shape[];
  /** 바탕이 밝으면 dark — 워터마크·[광고]를 어두운 글씨로 */
  ink?: "light" | "dark";
};

export type ExtractResult = {
  imageUrls: string[];
  caption: string;
};

export type RemixRequest = {
  /** 인스타그램 이미지 원본 URL (서버가 직접 내려받음) */
  imageUrls?: string[];
  /** 수동 업로드 이미지 (축소된 data URL) */
  imageDataUrls?: string[];
  /** 원문 캡션 */
  caption?: string;
  /** 수동으로 붙여넣은 슬라이드 원문 */
  slideText?: string;
};

export type RemixResult = {
  slides: { original: string; title: string; body: string }[];
  caption: string;
  /** 음식·레시피 카드뉴스인지 (false = 정치·시사·패션 등 일반 카드뉴스 → CTA·고정 댓글·DM 없음) */
  recipe: boolean;
  /** 쿠팡 파트너스·광고 게시물인지 ([광고] 표시·고지 기본값) */
  commerce: boolean;
  /** 자동 DM용 레시피 (레시피일 때만. 인트로·CTA·고지는 화면에서 템플릿대로 붙인다) */
  dm: DmContent | null;
};
