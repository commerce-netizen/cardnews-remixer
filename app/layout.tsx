import type { Metadata, Viewport } from "next";
import "./globals.css";
import { jua, pretendard } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "카드뉴스 각색기",
  description: "인스타그램 카드뉴스를 내 글로 새롭게 바꿔 드려요",
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
