"use client";

import { forwardRef, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Slide, TemplateId } from "@/lib/types";

/** 인스타그램 세로 피드 비율 4:5 */
export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

export const TEMPLATES: { id: TemplateId; name: string; swatch: CSSProperties }[] = [
  { id: "clean", name: "깔끔한 흰색", swatch: { background: "#ffffff", color: "#111" } },
  { id: "overlay", name: "사진 위 글씨", swatch: { background: "linear-gradient(#777,#111)", color: "#fff" } },
  { id: "accent", name: "노란 포인트", swatch: { background: "#ffd84d", color: "#111" } },
  { id: "note", name: "따뜻한 메모", swatch: { background: "#f4eee2", color: "#3b2f22" } },
];

function titleSize(title: string, cover: boolean): number {
  const n = title.replace(/\s/g, "").length;
  const base = n <= 10 ? 104 : n <= 18 ? 88 : n <= 28 ? 74 : n <= 40 ? 62 : 52;
  return cover ? Math.round(base * 1.1) : base;
}

function bodySize(body: string): number {
  const n = body.length;
  return n <= 60 ? 46 : n <= 110 ? 40 : n <= 170 ? 35 : 30;
}

type Props = { slide: Slide; index: number; total: number; template: TemplateId };

/** 실제 크기(1080×1350)로 그리는 슬라이드. PNG 저장 시 이 요소를 그대로 캡처한다. */
export const SlideCanvas = forwardRef<HTMLDivElement, Props>(function SlideCanvas(
  { slide, index, total, template },
  ref,
) {
  const cover = index === 0;
  const tSize = titleSize(slide.title, cover);
  const bSize = bodySize(slide.body);
  const hasImg = !!slide.image;

  const root: CSSProperties = {
    width: SLIDE_W,
    height: SLIDE_H,
    position: "relative",
    overflow: "hidden",
    fontFamily: "var(--font-pretendard), sans-serif",
    wordBreak: "keep-all",
    overflowWrap: "break-word",
    display: "flex",
    flexDirection: "column",
  };
  const title: CSSProperties = {
    fontSize: tSize,
    fontWeight: 800,
    lineHeight: 1.25,
    letterSpacing: "-0.02em",
    margin: 0,
    whiteSpace: "pre-wrap",
  };
  const body: CSSProperties = {
    fontSize: bSize,
    fontWeight: 500,
    lineHeight: 1.55,
    margin: 0,
    whiteSpace: "pre-wrap",
  };
  const pageNo = (color: string, bg: string): CSSProperties => ({
    position: "absolute",
    top: 44,
    right: 48,
    fontSize: 30,
    fontWeight: 700,
    color,
    background: bg,
    borderRadius: 999,
    padding: "6px 22px",
    zIndex: 2,
  });
  const img = (style: CSSProperties) =>
    hasImg ? <img src={slide.image!} alt="" crossOrigin="anonymous" style={{ display: "block", objectFit: "cover", ...style }} /> : null;
  const pager = `${index + 1} / ${total}`;

  if (template === "overlay") {
    return (
      <div ref={ref} style={{ ...root, background: "#14213d", color: "#fff", justifyContent: "flex-end" }}>
        {img({ position: "absolute", inset: 0, width: "100%", height: "100%" })}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: hasImg
              ? "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 58%, rgba(0,0,0,0.88) 100%)"
              : "linear-gradient(160deg, #1d3557, #14213d)",
          }}
        />
        <div style={pageNo("#fff", "rgba(0,0,0,0.45)")}>{pager}</div>
        <div style={{ position: "relative", padding: "0 80px 110px", display: "flex", flexDirection: "column", gap: 32 }}>
          <h2 style={{ ...title, textShadow: "0 2px 12px rgba(0,0,0,0.35)" }}>{slide.title}</h2>
          {slide.body && <p style={{ ...body, color: "rgba(255,255,255,0.92)" }}>{slide.body}</p>}
        </div>
      </div>
    );
  }

  if (template === "accent") {
    return (
      <div ref={ref} style={{ ...root, background: "#ffd84d", color: "#111", padding: "110px 80px 90px", gap: 44 }}>
        <div style={pageNo("#111", "rgba(255,255,255,0.7)")}>{pager}</div>
        <h2 style={title}>{slide.title}</h2>
        {hasImg && (
          <div style={{ flex: 1, minHeight: 0, borderRadius: 36, overflow: "hidden", border: "10px solid #111" }}>
            {img({ width: "100%", height: "100%" })}
          </div>
        )}
        {slide.body && (
          <p style={{ ...body, background: "#fff", borderRadius: 28, padding: "30px 38px", ...(hasImg ? {} : { marginTop: "auto" }) }}>
            {slide.body}
          </p>
        )}
      </div>
    );
  }

  if (template === "note") {
    return (
      <div ref={ref} style={{ ...root, background: "#f4eee2", color: "#3b2f22", padding: "100px 80px 90px", gap: 40 }}>
        <div style={pageNo("#3b2f22", "rgba(59,47,34,0.08)")}>{pager}</div>
        <div style={{ fontSize: 30, fontWeight: 700, color: "#b0623a", letterSpacing: "0.1em" }}>
          {cover ? "TODAY'S PICK" : `POINT ${String(index).padStart(2, "0")}`}
        </div>
        <h2 style={title}>
          <span style={{ background: "linear-gradient(transparent 62%, #f6c48f 62%)" }}>{slide.title}</span>
        </h2>
        {hasImg && (
          <div style={{ flex: 1, minHeight: 0, background: "#fff", padding: 18, borderRadius: 10, boxShadow: "0 10px 30px rgba(59,47,34,0.18)", transform: "rotate(-1.2deg)" }}>
            {img({ width: "100%", height: "100%", borderRadius: 4 })}
          </div>
        )}
        {slide.body && <p style={body}>{slide.body}</p>}
      </div>
    );
  }

  // clean (기본)
  return (
    <div ref={ref} style={{ ...root, background: "#fff", color: "#111" }}>
      <div style={pageNo(hasImg ? "#fff" : "#555", hasImg ? "rgba(0,0,0,0.45)" : "#f1f1f1")}>{pager}</div>
      {hasImg && <div style={{ height: 740, flexShrink: 0 }}>{img({ width: "100%", height: "100%" })}</div>}
      <div
        style={{
          flex: 1,
          padding: hasImg ? "64px 80px 80px" : "0 90px",
          display: "flex",
          flexDirection: "column",
          justifyContent: hasImg ? "flex-start" : "center",
          gap: 30,
        }}
      >
        <div style={{ width: 90, height: 12, background: "#1f5eff", borderRadius: 6 }} />
        <h2 style={title}>{slide.title}</h2>
        {slide.body && <p style={{ ...body, color: "#444" }}>{slide.body}</p>}
      </div>
    </div>
  );
});

/** 화면 폭에 맞춰 축소해 보여주는 미리보기 */
export const SlidePreview = forwardRef<HTMLDivElement, Props>(function SlidePreview(props, ref) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / SLIDE_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={box} className="preview-frame">
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: SLIDE_W, height: SLIDE_H }}>
        <SlideCanvas ref={ref} {...props} />
      </div>
    </div>
  );
});
