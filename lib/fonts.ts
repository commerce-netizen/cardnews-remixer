import localFont from "next/font/local";

export const pretendard = localFont({
  src: "../app/fonts/PretendardVariable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-pretendard",
});

// 카드뉴스 제목·본문용 둥근 굵은 고딕 (Jua, SIL OFL 1.1 — app/fonts/Jua-OFL.txt)
export const jua = localFont({
  src: "../app/fonts/Jua-Regular.woff2",
  display: "block",
  variable: "--font-jua",
});
