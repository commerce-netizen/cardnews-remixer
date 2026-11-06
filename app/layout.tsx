import type { Metadata, Viewport } from "next";
import "./globals.css";
import { jua, pretendard } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "사진 콘텐츠 만들기",
  description: "인스타그램 사진 게시물을 새 사진·새 글로 다시 만들어 드려요",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${pretendard.variable} ${jua.variable}`}>
      <body>{children}</body>
    </html>
  );
}
