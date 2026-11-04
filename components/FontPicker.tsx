"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FONTS, FONT_CATEGORIES, ensureFont, fontStack, getFont, type FontCategory } from "@/lib/webfonts";

type Props = {
  id?: string;
  value: string;
  onChange: (fontId: string) => void;
  /** 미리보기에 쓸 글 */
  sample?: string;
};

/** 화면에 보이는 칸만 글꼴을 내려받아 미리보기 (500개를 한꺼번에 받지 않게) */
function Preview({ fontId, text }: { fontId: string; text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((ents) => {
      if (ents.some((e) => e.isIntersecting)) {
        ensureFont(fontId);
        setSeen(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [fontId]);
  return (
    <span ref={ref} className="fp-sample" style={seen ? { fontFamily: fontStack(fontId) } : undefined}>
      {text}
    </span>
  );
}

/** 한글 글꼴 500여 개 중 검색·분류로 고르는 칸 */
export default function FontPicker({ id, value, onChange, sample }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<FontCategory | "전체">("전체");
  const current = getFont(value);

  useEffect(() => {
    ensureFont(value);
  }, [value]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return FONTS.filter(
      (f) => (cat === "전체" || f.cat === cat) && (!s || f.label.toLowerCase().includes(s) || f.id.toLowerCase().includes(s)),
    );
  }, [q, cat]);

  return (
    <div className="fp">
      <button
        id={id}
        type="button"
        className="fp-current"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ fontFamily: current.stack }}
      >
        {current.label}
        <span className="fp-caret">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="fp-panel">
          <input
            type="text"
            placeholder={`글꼴 이름 검색 (전체 ${FONTS.length}개)`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="fp-cats">
            {(["전체", ...FONT_CATEGORIES] as const).map((c) => (
              <button key={c} type="button" className={cat === c ? "on" : ""} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
          <ul className="fp-list" role="listbox">
            {list.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={f.id === value}
                  className={f.id === value ? "on" : ""}
                  onClick={() => {
                    onChange(f.id);
                    setOpen(false);
                  }}
                >
                  <span className="fp-name">{f.label}</span>
                  <Preview fontId={f.id} text={sample || "가나다 카드뉴스 123"} />
                </button>
              </li>
            ))}
            {!list.length && <li className="muted small" style={{ padding: 12 }}>찾는 글꼴이 없어요.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
