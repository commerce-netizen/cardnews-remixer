import Link from "next/link";
import HotBoard from "./HotBoard";

export const metadata = { title: "인기 레시피 · 카드뉴스 각색기" };

export default function HotPage() {
  return (
    <main className="page">
      <nav className="tabs">
        <Link className="tab" href="/">카드뉴스 만들기</Link>
        <span className="tab on">🔥 인기 레시피</span>
        <Link className="tab" href="/templates">디자인 템플릿</Link>
      </nav>
      <HotBoard />
    </main>
  );
}
