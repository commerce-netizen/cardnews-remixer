"use client";

import { useEffect, useState } from "react";

const KEY = "theme";

/** 지금 실제로 보이는 테마 (사용자가 고른 것 > 시스템 설정) */
function current(): "light" | "dark" {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** 오른쪽 위 밝게/어둡게 전환 버튼. 고른 값은 이 브라우저에 기억한다 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    setTheme(current());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(current());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    setTheme(next);
  };

  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={dark ? "밝은 화면으로" : "어두운 화면으로"}
      title={dark ? "밝은 화면으로" : "어두운 화면으로"}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" fill="currentColor" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <rect key={a} x="11" y="1.5" width="2" height="4" rx="1" fill="currentColor" transform={`rotate(${a} 12 12)`} />
          ))}
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" fill="currentColor" />
        </svg>
      )}
      <span>{theme === null ? "" : dark ? "밝게" : "어둡게"}</span>
    </button>
  );
}
