import Link from "next/link";
import HotBoard from "./HotBoard";

export const metadata = { title: "인기 게시물 · 돈작가" };

export default function HotPage() {
  return (
    <main className="page">
      <nav className="tabs">
        <Link className="tab" href="/">사진 콘텐츠 만들기</Link>
        <span className="tab on">인기 게시물</span>
        <Link className="tab" href="/templates">디자인 템플릿</Link>
      </nav>
      <HotBoard />
    </main>
  );
}
