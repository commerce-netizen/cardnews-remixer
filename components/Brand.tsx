import Link from "next/link";

/**
 * 프로그램 이름 '돈작가' 로고.
 * '돈'은 사이트 메인 블루, 그 위에 비스듬히 얹힌 붓(작가의 상징). '작가'는 본문 글자색이라 다크 모드에서도 보인다.
 */
export function BrushMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <g transform="rotate(42 24 24)">
        {/* 손잡이 */}
        <rect x="18.5" y="0.5" width="11" height="24" rx="5.5" fill="var(--brush-handle)" />
        <rect x="21" y="3" width="2.4" height="18" rx="1.2" fill="#ffffff" opacity="0.3" />
        {/* 쇠테 */}
        <rect x="17.5" y="22.5" width="13" height="7" rx="2" fill="var(--brush-ferrule)" />
        {/* 붓털 + 끝에 묻은 블루 먹 */}
        <path d="M17.8 29.3 C17 35.5 20.4 42.5 24 47.5 C27.6 42.5 31 35.5 30.2 29.3 Z" fill="var(--brush-hair)" />
        <path d="M19.6 37.6 C20.9 41.4 22.3 44.6 24 47.5 C25.7 44.6 27.1 41.4 28.4 37.6 C25.6 39.2 22.4 39.2 19.6 37.6 Z" fill="var(--primary)" />
      </g>
    </svg>
  );
}

export default function Brand() {
  return (
    <Link href="/" className="brand" aria-label="돈작가 처음 화면">
      <span className="brand-don">
        돈
        <BrushMark className="brand-brush" />
      </span>
      <span className="brand-rest">작가</span>
    </Link>
  );
}
