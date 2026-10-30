"use client";

import { forwardRef, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { jua, pretendard } from "@/lib/fonts";
import type { Slide } from "@/lib/types";

/** 인스타그램 세로 피드 비율 4:5 */
export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

export const DEFAULT_WATERMARK = "맛집도둑";

/*
 * 디자인 수치는 저장소 루트의 레퍼런스(ref-slide*.jpg, 800×1000)를 픽셀 측정해 1080×1350(×1.35)로 옮긴 값.
 *   표지 제목: Jua 84px, 줄 간격 103px, 왼쪽 77px, 마지막 줄 바닥 ≈1185px, 검은 외곽선
 *   본문 박스: x 167~909(폭 742, 가운데), y 953~1211(높이 258), 흰색 48% 반투명 + 1.5px 검은 테두리
 *   본문 글자: Jua 52px, 줄 간격 57px, 가운데 정렬, 검은 외곽선
 *   [광고]: 오른쪽 76px·위 61px, 30px, 흰색 반투명 / 워터마크: 가운데, 중심 y ≈1284px, 31px, 흰색 반투명
 */
// CSS 변수(var(--font-…))가 아닌 실제 글꼴 이름을 써야 PNG 저장(html-to-image) 때 글꼴이 함께 들어간다
const TITLE_FONT = `${jua.style.fontFamily}, ${pretendard.style.fontFamily}, sans-serif`;
const SMALL_FONT = `${pretendard.style.fontFamily}, sans-serif`;
const BOX = { left: 167, width: 742, bottom: SLIDE_H - 1211, minHeight: 258 };
const BOX_FILL = "rgba(255, 255, 255, 0.48)";
const BOX_BORDER = "1.5px solid rgba(0, 0, 0, 0.6)";

/** 글자 둘레를 검은 외곽선으로 감싸는 text-shadow (PNG 저장에서도 그대로 보이도록 stroke 대신 사용) */
function outline(px: number, extra = ""): string {
  const shadows: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    shadows.push(`${(Math.cos(a) * px).toFixed(2)}px ${(Math.sin(a) * px).toFixed(2)}px 0 #000`);
  }
  if (extra) shadows.push(extra);
  return shadows.join(", ");
}
const TITLE_SHADOW = outline(4, "0 4px 10px rgba(0,0,0,0.45)");
const BODY_SHADOW = outline(3);

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

type Props = { slide: Slide; index: number; watermark: string };

/** 실제 크기(1080×1350)로 그리는 슬라이드. PNG 저장 시 이 요소를 그대로 캡처한다. */
export const SlideCanvas = forwardRef<HTMLDivElement, Props>(function SlideCanvas({ slide, index, watermark }, ref) {
  const cover = index === 0;
  const text = (cover ? slide.title : slide.body).trim();

  const root: CSSProperties = {
    width: SLIDE_W,
    height: SLIDE_H,
    position: "relative",
    overflow: "hidden",
    background: "linear-gradient(160deg, #4a4a4a, #1f1f1f)",
    wordBreak: "keep-all",
    overflowWrap: "break-word",
  };

  const tSize = titleSize(text);
  const bSize = bodySize(text);

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

      {/* (a) 쿠팡 파트너스 고지 */}
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

      {cover ? (
        text && (
          <h2
            style={{
              position: "absolute",
              left: 77,
              right: 77,
              bottom: 150,
              margin: 0,
              fontFamily: TITLE_FONT,
              fontWeight: 400,
              fontSize: tSize,
              lineHeight: `${Math.round(tSize * 1.23)}px`,
              color: "#fff",
              textAlign: "left",
              whiteSpace: "pre-wrap",
              textShadow: TITLE_SHADOW,
            }}
          >
            {text}
          </h2>
        )
      ) : (
        text && (
          <div
            style={{
              position: "absolute",
              left: BOX.left,
              width: BOX.width,
              bottom: BOX.bottom,
              minHeight: BOX.minHeight,
              boxSizing: "border-box",
              padding: "28px 30px",
              background: BOX_FILL,
              border: BOX_BORDER,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <p
              style={{
                margin: 0,
                width: "100%",
                fontFamily: TITLE_FONT,
                fontWeight: 400,
                fontSize: bSize,
                lineHeight: `${Math.round(bSize * 1.1)}px`,
                color: "#fff",
                textAlign: "center",
                whiteSpace: "pre-wrap",
                textShadow: BODY_SHADOW,
              }}
            >
              {text}
            </p>
          </div>
        )
      )}

      {/* (b) 워터마크 */}
      {watermark.trim() && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 1264,
            textAlign: "center",
            fontFamily: SMALL_FONT,
            fontSize: 31,
            fontWeight: 400,
            lineHeight: 1.3,
            color: "rgba(255, 255, 255, 0.55)",
            textShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        >
          {watermark.trim()}
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
