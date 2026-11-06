import Link from "next/link";
import TemplateManager from "@/components/TemplateManager";

export const metadata = { title: "디자인 템플릿 · 사진 콘텐츠 만들기" };

export default function TemplatesPage() {
  return (
    <main className="page">
      <nav className="tabs">
        <Link className="tab" href="/">사진 콘텐츠 만들기</Link>
        <Link className="tab" href="/hot">인기 게시물</Link>
        <span className="tab on">디자인 템플릿</span>
      </nav>
      <TemplateManager />
    </main>
  );
}
