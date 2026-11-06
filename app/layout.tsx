import type { Metadata, Viewport } from "next";
import "./globals.css";
import { jua, logoFont, pretendard } from "@/lib/fonts";
import Brand from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";
import SiteNav from "@/components/SiteNav";

export const metadata: Metadata = {
  title: "돈작가 사진 생성기",
  description: "인스타그램 사진 게시물을 새 사진·새 글로 다시 만들어 드려요",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1117" },
  ],
};

// 화면이 그려지기 전에 저장해 둔 테마를 입혀 깜빡임을 막는다
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${pretendard.variable} ${jua.variable} ${logoFont.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Brand />
            <ThemeToggle />
          </div>
          <div className="site-header-tabs">
            <SiteNav />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
