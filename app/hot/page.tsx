import HotBoard from "./HotBoard";

export const metadata = { title: "인기 게시물 · 돈작가 사진 생성기" };

export default function HotPage() {
  return (
    <main className="page">
      <HotBoard />
    </main>
  );
}
