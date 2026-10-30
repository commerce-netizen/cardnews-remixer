import Link from "next/link";
import TemplateManager from "@/components/TemplateManager";

export const metadata = { title: "디자인 템플릿 · 카드뉴스 각색기" };

export default function TemplatesPage() {
  return (
    <main className="page">
      <nav className="tabs">
        <Link className="tab" href="/">카드뉴스 만들기</Link>
        <span className="tab on">디자인 템플릿</span>
      </nav>
      <TemplateManager />
    </main>
  );
}
