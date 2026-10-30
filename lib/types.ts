export type Slide = {
  /** 화면에 표시할 이미지 주소 (프록시 URL 또는 data URL). 없으면 글자만 있는 슬라이드 */
  image: string | null;
  /** 원본 슬라이드에서 읽어낸 글 (참고용) */
  original: string;
  title: string;
  body: string;
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
};
