"use client";

import { forwardRef, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { pretendard } from "@/lib/fonts";
import { fontStack } from "@/lib/webfonts";
import {
  DEFAULT_TEMPLATE,
  SIZE_SCALE,
  isLight,
  rgba,
  type Template,
  type TextStyle,
} from "@/lib/templates";
import type { Slide } from "@/lib/types";

/** 인스타그램 세로 피드 비율 4:5 */
export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

/*
 * 기본 디자인 수치는 저장소 루트의 레퍼런스(ref-slide*.jpg, 800×1000)를 픽셀 측정해 1080×1350(×1.35)로 옮긴 값.
 *   표지 제목: 84px, 줄 간격 103px, 왼쪽 77px, 마지막 줄 바닥 ≈1185px, 검은 외곽선
 *   본문 박스: x 169~911(폭 742, 가운데), y 953~1211(높이 258), 흰색 48% 반투명 + 1.5px 검은 테두리
 *   본문 글자: 52px, 줄 간격 57px, 가운데 정렬, 검은 외곽선
 *   [광고]: 오른쪽 76px·위 58px, 30px, 흰색 반투명 / 워터마크: 가운데, 위 1264px, 31px, 흰색 반투명
 * 템플릿은 이 틀 위에서 글꼴·색·글상자·위치만 바꾼다.
 */
// CSS 변수(var(--font-…))가 아닌 실제 글꼴 이름을 써야 PNG 저장(html-to-image) 때 글꼴이 함께 들어간다
const SMALL_FONT = `${pretendard.style.fontFamily}, sans-serif`;
const COVER_INSET = { x: 77, y: 150 };
const BODY_INSET = { x: 169, y: 139 };

/** 글자 둘레를 테두리로 감싸는 text-shadow (PNG 저장에서도 그대로 보이도록 stroke 대신 사용) */
function outline(px: number, color: string, extra = ""): string {
  const shadows: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    shadows.push(`${(Math.cos(a) * px).toFixed(2)}px ${(Math.sin(a) * px).toFixed(2)}px 0 ${color}`);
  }
  if (extra) shadows.push(extra);
  return shadows.join(", ");
}

const lineCount = (t: string, perLine: number) =>
  t.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);

/** 줄이 많아지면 글자를 줄여 사진 밖으로 넘치지 않게 */
// 한 줄에 들어가는 대략의 글자 수(공백 포함): 표지 84px·폭 926px ≈ 15자, 본문 52px·폭 680px ≈ 20자
function titleSize(t: string) {
  const n = lineCount(t, 15);
  return n <= 3 ? 84 : n === 4 ? 74 : 64;
}
function bodySize(t: string) {
  const n = lineCount(t, 20);
  return n <= 3 ? 52 : n === 4 ? 46 : 40;
}

const JUSTIFY: Record<TextStyle["pos"], CSSProperties["justifyContent"]> = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
};

type Props = { slide: Slide; index: number; watermark: string; template?: Template };

/** 실제 크기(1080×1350)로 그리는 슬라이드. PNG 저장 시 이 요소를 그대로 캡처한다. */
export const SlideCanvas = forwardRef<HTMLDivElement, Props>(function SlideCanvas(
  { slide, index, watermark, template = DEFAULT_TEMPLATE },
  ref,
) {
  const cover = index === 0;
  const text = (cover ? slide.title : slide.body).trim();
  const style = cover ? template.cover : template.body;
  const inset = cover ? COVER_INSET : BODY_INSET;

  const base = cover ? titleSize(text) : bodySize(text);
  const size = Math.round(base * SIZE_SCALE[style.size]);
  const outlineColor = isLight(style.color) ? "#000" : "#fff";
  const shadow = style.outline
    ? outline(cover ? 4 : 3, outlineColor, cover ? "0 4px 10px rgba(0,0,0,0.45)" : "")
    : "none";

  const root: CSSProperties = {
    width: SLIDE_W,
    height: SLIDE_H,
    position: "relative",
    overflow: "hidden",
    background: "linear-gradient(160deg, #4a4a4a, #1f1f1f)",
    wordBreak: "keep-all",
    overflowWrap: "break-word",
  };

  const paragraph = (
    <p
      style={{
        margin: 0,
        width: "100%",
        fontFamily: fontStack(style.fontId),
        fontWeight: 400,
        fontSize: size,
        lineHeight: `${Math.round(size * (cover ? 1.23 : 1.1))}px`,
        color: style.color,
        textAlign: style.align,
        whiteSpace: "pre-wrap",
        textShadow: shadow,
      }}
    >
      {text}
    </p>
  );

  const wm = watermark.trim();
  const wmTop = template.watermark.pos === "top-left";

  return (
    <div ref={ref} style={root}>
      {slide.image && (
        <img
          src={slide.image}
          alt=""
          crossOrigin="anonymous"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}

      {/* (a) 쿠팡 파트너스 고지 — 법에서 요구하는 표시라 항상 넣는다 */}
      <div
        style={{
          position: "absolute",
          top: 58,
          right: 76,
          fontFamily: SMALL_FONT,
          fontSize: 30,
          fontWeight: 400,
          lineHeight: 1.2,
          color: "rgba(255, 255, 255, 0.72)",
          textShadow: "0 1px 3px rgba(0,0,0,0.25)",
        }}
      >
        [광고]
      </div>

      {/* (b) 글 (표지는 제목, 그 뒤는 본문) */}
      {text && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: JUSTIFY[style.pos],
            padding: `${inset.y}px ${inset.x}px`,
            boxSizing: "border-box",
          }}
        >
          {style.box ? (
            <div
              style={{
                width: "100%",
                minHeight: 258,
                boxSizing: "border-box",
                padding: "28px 30px",
                background: rgba(style.boxColor, style.boxOpacity),
                border: style.boxBorder ? "1.5px solid rgba(0, 0, 0, 0.6)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {paragraph}
            </div>
          ) : (
            paragraph
          )}
        </div>
      )}

      {/* (c) 워터마크 */}
      {wm && (
        <div
          style={{
            position: "absolute",
            left: template.watermark.pos === "bottom" ? 0 : 77,
            right: template.watermark.pos === "bottom" ? 0 : undefined,
            top: wmTop ? 58 : 1264,
            textAlign: template.watermark.pos === "bottom" ? "center" : "left",
            fontFamily: fontStack(template.watermark.fontId),
            fontSize: 31,
            fontWeight: 400,
            lineHeight: 1.3,
            color: rgba(template.watermark.color, template.watermark.opacity),
            textShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        >
          {wm}
        </div>
      )}
    </div>
  );
});

/** 화면 폭에 맞춰 축소해 보여주는 미리보기 */
export const SlidePreview = forwardRef<HTMLDivElement, Props & { overlay?: ReactNode }>(function SlidePreview(
  { overlay, ...props },
  ref,
) {
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
      {/* 화면에만 보이는 덧씌움(로딩 표시 등) — PNG 저장에는 들어가지 않음 */}
      {overlay}
    </div>
  );
});
