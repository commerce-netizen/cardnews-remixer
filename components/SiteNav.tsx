"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type MouseEvent } from "react";

const TABS = [
  { href: "/", label: "사진 콘텐츠 만들기" },
  { href: "/hot", label: "인기 게시물" },
  { href: "/templates", label: "디자인 템플릿" },
];

/** 화면이 이 값을 켜 두면(만들던 콘텐츠가 있을 때) 다른 탭으로 갈 때 한 번 묻는다 */
export const DIRTY_ATTR = "data-unsaved";

/**
 * 맨 위 탭 3개 — 머리줄(로고)과 함께 화면 위에 붙어서 스크롤해도 늘 보인다.
 * 머리줄 높이를 --header-h 로 알려 줘서, 아래쪽에서 위에 붙는 것들(미리보기 등)이 그 밑에 붙게 한다.
 */
export default function SiteNav() {
  const path = usePathname();

  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!header) return;
    const set = () => document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  const guard = (e: MouseEvent, href: string) => {
    if (href === path && !document.body.hasAttribute(DIRTY_ATTR)) return;
    if (document.body.hasAttribute(DIRTY_ATTR) && !window.confirm("다른 탭으로 가면 지금 만들던 콘텐츠가 사라져요. 이동할까요?")) {
      e.preventDefault();
      return;
    }
    // 같은 탭(만들기)을 다시 누르면 처음 화면으로
    if (href === path) {
      e.preventDefault();
      window.location.href = href;
    }
  };

  return (
    <nav className="tabs site-tabs" aria-label="메뉴">
      {TABS.map((t) => {
        const on = t.href === "/" ? path === "/" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            className={`tab${on ? " on" : ""}`}
            href={t.href}
            aria-current={on ? "page" : undefined}
            onClick={(e) => guard(e, t.href)}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
