import localFont from "next/font/local";
import { Black_Han_Sans } from "next/font/google";

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

// 로고 '돈작가'용 아주 굵고 각진 고딕 (Black Han Sans, SIL OFL 1.1)
export const logoFont = Black_Han_Sans({
  weight: "400",
  subsets: ["latin"],
  display: "block",
  variable: "--font-logo",
});
