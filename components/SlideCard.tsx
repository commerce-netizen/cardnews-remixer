"use client";

import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from "react";
import { pretendard } from "@/lib/fonts";
import { fontStack, snapWeight } from "@/lib/webfonts";
import { SLIDE_W, rgba, slideHeight, type BlockStyle, type TextBlock } from "@/lib/layout";
import type { WatermarkStyle } from "@/lib/templates";
import type { Slide } from "@/lib/types";
import type { Shape } from "@/lib/magazine";

export { SLIDE_W };
/** 레시피 모드 기본: 인스타그램 세로 피드 4:5 */
export const SLIDE_H = 1350;

const SMALL_FONT = `${pretendard.style.fontFamily}, sans-serif`;

/** 글자 둘레를 테두리로 감싸는 text-shadow (PNG 저장에서도 그대로 보이도록 stroke 대신 사용) */
function outlineShadow(px: number, color: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    out.push(`${(Math.cos(a) * px).toFixed(2)}px ${(Math.sin(a) * px).toFixed(2)}px 0 ${color}`);
  }
  return out;
}

export function textShadow(b: BlockStyle): string {
  const s: string[] = [];
  if (b.outline && b.outlineWidth > 0) s.push(...outlineShadow(b.outlineWidth, b.outlineColor));
  if (b.shadow) s.push(`0 ${Math.max(2, Math.round(b.size * 0.05))}px ${Math.max(4, Math.round(b.size * 0.14))}px ${rgba(b.shadowColor, 55)}`);
  return s.length ? s.join(", ") : "none";
}

/** 글꼴이 늦게 내려오면 글 크기 맞춤을 다시 하도록 */
function useFontsTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    const on = () => setTick((t) => t + 1);
    document.fonts.addEventListener("loadingdone", on);
    return () => document.fonts.removeEventListener("loadingdone", on);
  }, []);
  return tick;
}

const JUSTIFY = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;

function withAccent(text: string, accent: string, color: string): ReactNode {
  if (!accent || !text.includes(accent)) return text;
  const parts = text.split(accent);
  return parts.flatMap((p, i) => (i === 0 ? [p] : [<span key={i} style={{ color }}>{accent}</span>, p]));
}

/** 글 상자 하나. 글이 상자를 넘치면 글자 크기를 자동으로 줄인다 */
function Block({ b, height, text, tick }: { b: TextBlock; height: number; text: string; tick: number }) {
  const p = useRef<HTMLParagraphElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = p.current;
    const wrap = box.current;
    if (!el || !wrap) return;
    const pad = b.box ? b.boxPad : 0;
    const availH = wrap.clientHeight - pad * 2;
    let fs = b.size;
    el.style.fontSize = `${fs}px`;
    const min = Math.max(10, b.size * 0.35);
    while (fs > min && (el.scrollHeight > availH + 1 || el.scrollWidth > el.clientWidth + 1)) {
      fs = Math.max(min, fs - Math.max(1, fs * 0.05));
      el.style.fontSize = `${fs}px`;
    }
  }, [text, b.size, b.fontId, b.weight, b.w, b.h, b.lineHeight, b.letterSpacing, b.box, b.boxPad, height, tick]);

  const wrapStyle: CSSProperties = {
    position: "absolute",
    left: (b.x / 100) * SLIDE_W,
    top: (b.y / 100) * height,
    width: (b.w / 100) * SLIDE_W,
    height: (b.h / 100) * height,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: JUSTIFY[b.vAlign],
    padding: b.box ? b.boxPad : 0,
    background: b.box ? rgba(b.boxColor, b.boxOpacity) : undefined,
    borderRadius: b.box ? b.boxRadius : 0,
    border: b.box && b.boxBorder ? `1.5px solid ${rgba(b.boxBorderColor, 60)}` : undefined,
    overflow: "hidden",
  };
  return (
    <div ref={box} style={wrapStyle}>
      <p
        ref={p}
        style={{
          margin: 0,
          width: "100%",
          fontFamily: fontStack(b.fontId),
          fontWeight: snapWeight(b.fontId, b.weight),
          lineHeight: b.lineHeight,
          letterSpacing: `${b.letterSpacing / 100}em`,
          color: b.color,
          textAlign: b.align,
          whiteSpace: "pre-wrap",
          wordBreak: "keep-all",
          overflowWrap: "break-word",
          textShadow: textShadow(b),
        }}
      >
        {withAccent(text, b.accent, b.accentColor)}
      </p>
    </div>
  );
}

/** 매거진 레이아웃 도형 (띠·박스·선·체크칸·동그란 프로필) */
function ShapeEl({ s, height }: { s: Shape; height: number }) {
  const base: CSSProperties = {
    position: "absolute",
    left: `${s.x}%`,
    top: `${s.y}%`,
    width: `${s.w}%`,
    height: `${s.h}%`,
    boxSizing: "border-box",
    background: s.fill,
    border: s.border ? `${s.bw ?? 2}px solid ${s.border}` : undefined,
    borderRadius: s.kind === "avatar" ? "50%" : s.radius ?? 0,
  };
  if (s.kind !== "avatar") return <div style={base} />;
  return (
    <div
      style={{
        ...base,
        display: "grid",
        placeItems: "center",
        color: "#ffffff",
        fontFamily: SMALL_FONT,
        fontWeight: 800,
      }}
    >
      <span style={{ fontSize: Math.round((s.h / 100) * height * 0.46), lineHeight: 1 }}>{s.text}</span>
    </div>
  );
}

type CanvasProps = { slide: Slide; watermark: WatermarkStyle; adLabel: boolean };

/** 실제 크기(1080×높이)로 그리는 슬라이드. PNG 저장 시 이 요소를 그대로 캡처한다. */
export const SlideCanvas = forwardRef<HTMLDivElement, CanvasProps>(function SlideCanvas({ slide, watermark, adLabel }, ref) {
  const tick = useFontsTick();
  const height = slideHeight(slide.ratio);
  const wm = watermark.text.trim();
  const hasHandle = slide.blocks.some((b) => b.role === "handle");
  const wmTop = watermark.pos === "top-left";

  const magazine = !!slide.layout;
  const darkInk = slide.ink === "dark";
  const photo = slide.photo;
  const pr = photo ?? { x: 0, y: 0, w: 100, h: 100 };

  return (
    <div
      ref={ref}
      style={{
        width: SLIDE_W,
        height,
        position: "relative",
        overflow: "hidden",
        background: magazine
          ? slide.bg
          : slide.image ? "#222" : slide.bg || "linear-gradient(160deg, #4a4a4a, #1f1f1f)",
      }}
    >
      {photo !== null && slide.image && (
        <img
          src={slide.image}
          alt=""
          crossOrigin="anonymous"
          style={{
            position: "absolute",
            left: `${pr.x}%`,
            top: `${pr.y}%`,
            width: `${pr.w}%`,
            height: `${pr.h}%`,
            objectFit: "cover",
            display: "block",
          }}
        />
      )}
      {/* 매거진 레이아웃의 사진 칸이 비어 있으면 자리 표시 */}
      {magazine && photo !== null && !slide.image && (
        <div
          style={{
            position: "absolute",
            left: `${pr.x}%`,
            top: `${pr.y}%`,
            width: `${pr.w}%`,
            height: `${pr.h}%`,
            background: darkInk ? "#dcdcdc" : "#3a3a3a",
            display: "grid",
            placeItems: "center",
            color: darkInk ? "#8a8a8a" : "#8f8f8f",
            fontFamily: SMALL_FONT,
            fontSize: 30,
          }}
        >
          사진 자리
        </div>
      )}

      {slide.shapes?.map((sh, i) => <ShapeEl key={i} s={sh} height={height} />)}

      {slide.blocks.map((b) => {
        // 계정 이름 자리에는 내 워터마크 문구가 들어간다
        const text = b.role === "handle" && wm ? wm : b.text;
        if (!text.trim()) return null;
        return <Block key={b.id} b={b} height={height} text={text} tick={tick} />;
      })}

      {/* 쿠팡 파트너스 고지 — 광고 게시물이면 꼭 넣는다 */}
      {adLabel && (
        <div
          style={{
            position: "absolute",
            top: 58,
            right: 76,
            fontFamily: SMALL_FONT,
            fontSize: 30,
            lineHeight: 1.2,
            color: darkInk ? "rgba(20, 20, 20, 0.6)" : "rgba(255, 255, 255, 0.72)",
            textShadow: darkInk ? "none" : "0 1px 3px rgba(0,0,0,0.25)",
          }}
        >
          [광고]
        </div>
      )}

      {wm && !hasHandle && (
        <div
          style={{
            position: "absolute",
            left: watermark.pos === "bottom" ? 0 : 77,
            right: watermark.pos === "bottom" ? 0 : undefined,
            top: wmTop ? 58 : undefined,
            bottom: wmTop ? undefined : Math.round(height * 0.034),
            textAlign: watermark.pos === "bottom" ? "center" : "left",
            fontFamily: fontStack(watermark.fontId),
            fontSize: watermark.size || 31,
            lineHeight: 1.3,
            color: darkInk ? rgba("#141414", Math.min(80, watermark.opacity)) : rgba(watermark.color, watermark.opacity),
            textShadow: darkInk ? "none" : "0 1px 3px rgba(0,0,0,0.2)",
          }}
        >
          {wm}
        </div>
      )}
    </div>
  );
});

type PreviewProps = CanvasProps & {
  overlay?: ReactNode;
  /** 편집 화면: 글 상자를 눌러 고르고, 끌어서 옮기고, 오른쪽 아래 손잡이로 크기 조절 */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onMoveBlock?: (id: string, patch: Partial<BlockStyle>) => void;
};

/** 화면 폭에 맞춰 축소해 보여주는 미리보기 */
export const SlidePreview = forwardRef<HTMLDivElement, PreviewProps>(function SlidePreview(
  { overlay, selectedId, onSelect, onMoveBlock, ...props },
  ref,
) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const height = slideHeight(props.slide.ratio);
  const drag = useRef<{ id: string; kind: "move" | "size"; sx: number; sy: number; b: BlockStyle } | null>(null);

  // 첫 그림 전에 폭을 재야 한다. 안 그러면 한 번 크게 그려졌다가 줄어들어 깜빡인다
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / SLIDE_W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const editable = !!onMoveBlock;
  const start = (e: RPointerEvent, b: TextBlock, kind: "move" | "size") => {
    e.stopPropagation();
    onSelect?.(b.id);
    drag.current = { id: b.id, kind, sx: e.clientX, sy: e.clientY, b: { ...b } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    const el = box.current;
    if (!d || !el || !onMoveBlock) return;
    const dx = ((e.clientX - d.sx) / el.clientWidth) * 100;
    const dy = ((e.clientY - d.sy) / el.clientHeight) * 100;
    const r = (v: number) => Math.round(v * 10) / 10;
    if (d.kind === "move") {
      onMoveBlock(d.id, {
        x: r(Math.min(100 - d.b.w * 0.2, Math.max(-d.b.w * 0.8, d.b.x + dx))),
        y: r(Math.min(100 - d.b.h * 0.2, Math.max(-d.b.h * 0.8, d.b.y + dy))),
      });
    } else {
      onMoveBlock(d.id, { w: r(Math.max(5, d.b.w + dx)), h: r(Math.max(3, d.b.h + dy)) });
    }
  };
  const end = () => {
    drag.current = null;
  };

  return (
    <div ref={box} className="preview-frame" style={{ aspectRatio: `${SLIDE_W} / ${height}` }}>
      <div
        style={{
          // 변환 전 크기가 바깥 레이아웃에 영향 주지 않게 띄워 둔다
          position: "absolute",
          top: 0,
          left: 0,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: SLIDE_W,
          height,
          visibility: scale ? "visible" : "hidden",
        }}
      >
        <SlideCanvas ref={ref} {...props} />
      </div>

      {/* 편집용 손잡이 — 캡처 대상 밖이라 PNG 저장에는 들어가지 않음 */}
      {editable && (
        <div className="block-layer" onPointerDown={() => onSelect?.(null)}>
          {props.slide.blocks.map((b) => (
            <div
              key={b.id}
              className={`block-hit${selectedId === b.id ? " on" : ""}`}
              style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}
              onPointerDown={(e) => start(e, b, "move")}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              title="끌어서 옮기기"
            >
              {selectedId === b.id && (
                <span
                  className="block-handle"
                  onPointerDown={(e) => start(e, b, "size")}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                  title="끌어서 크기 조절"
                />
              )}
            </div>
          ))}
        </div>
      )}
      {overlay}
    </div>
  );
});
