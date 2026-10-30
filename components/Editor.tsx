"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { DEFAULT_WATERMARK, SLIDE_H, SLIDE_W, SlidePreview } from "./SlideCard";
import { coverCrop, resizeImage } from "@/lib/client-images";
import { downloadZip, renderSlides, triggerDownload } from "@/lib/export";
import type { Slide } from "@/lib/types";

const WATERMARK_KEY = "cardnews.watermark";

// 'AI 새 사진' 기능 스위치 (빌드 시 값이 들어감). 기본 켜짐, "0"이면 끔
const IMAGE_GEN_ENABLED = process.env.NEXT_PUBLIC_ENABLE_IMAGE_GEN !== "0";

type Props = {
  slides: Slide[];
  caption: string;
  onChangeSlides: Dispatch<SetStateAction<Slide[]>>;
  onChangeCaption: (c: string) => void;
  onRemixAgain: () => void;
  onRestart: () => void;
};

export default function Editor({ slides, caption, onChangeSlides, onChangeCaption, onRemixAgain, onRestart }: Props) {
  const [watermark, setWatermark] = useState(DEFAULT_WATERMARK);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [genIndex, setGenIndex] = useState<number | null>(null);
  // AI 새 사진으로 바꾸기 전 사진 (되돌리기용)
  const [prevImages, setPrevImages] = useState<Record<number, string | null>>({});
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const resultBlobs = useRef<Blob[]>([]);

  // 워터마크 문구는 다음에 또 쓰도록 이 브라우저에 기억
  useEffect(() => {
    try {
      const saved = localStorage.getItem(WATERMARK_KEY);
      if (saved !== null) setWatermark(saved);
    } catch {}
  }, []);
  const changeWatermark = (v: string) => {
    setWatermark(v);
    setResults(null);
    try {
      localStorage.setItem(WATERMARK_KEY, v);
    } catch {}
  };

  const update = (i: number, patch: Partial<Slide>) => {
    // 사진 생성처럼 오래 걸리는 작업 중에 고친 글이 덮어써지지 않도록 항상 최신 상태에 적용
    onChangeSlides((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setResults(null);
  };

  const forgetPrev = (i: number) =>
    setPrevImages((p) => {
      const next = { ...p };
      delete next[i];
      return next;
    });

  const replaceImage = async (i: number, file?: File) => {
    if (!file) return;
    try {
      update(i, { image: await resizeImage(file, 1600, 0.9) });
      forgetPrev(i);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const generateImage = async (i: number) => {
    setError(null);
    setGenIndex(i);
    const current = slides[i].image;
    try {
      // 지금 사진(인스타 원본·업로드·이전 AI 사진)을 적당한 크기의 JPEG로 바꿔 보냄
      const source = current ? await resizeImage(current, 1536, 0.85) : null;
      const res = await fetch("/api/image-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: source, title: slides[i].title, body: slides[i].body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.image) throw new Error(data.error || "새 사진을 만들지 못했어요. 다시 한 번 눌러 주세요.");
      const image = await coverCrop(data.image, SLIDE_W, SLIDE_H);
      setPrevImages((p) => ({ ...p, [i]: current }));
      update(i, { image });
    } catch (e) {
      setError(`${i + 1}번 장: ${(e as Error).message}`);
      window.scrollTo(0, 0);
    } finally {
      setGenIndex(null);
    }
  };

  const undoImage = (i: number) => {
    update(i, { image: prevImages[i] ?? null });
    forgetPrev(i);
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("복사가 안 됐어요. 캡션 칸을 길게 눌러 직접 복사해 주세요.");
    }
  };

  const approve = async () => {
    setError(null);
    setBusy(`완성본 만드는 중… (0 / ${slides.length}장)`);
    try {
      const els = nodes.current.slice(0, slides.length).filter((n): n is HTMLDivElement => !!n);
      const blobs = await renderSlides(els, (d) => setBusy(`완성본 만드는 중… (${d} / ${slides.length}장)`));
      resultBlobs.current = blobs;
      setResults(blobs.map((b) => URL.createObjectURL(b)));
      await downloadZip(blobs, caption);
    } catch (e) {
      console.error(e);
      setError("완성본을 만들다 문제가 생겼어요. 사진을 바꾸거나 다시 눌러 주세요.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h1>각색이 끝났어요!</h1>
      <p className="lead">장마다 사진과 글을 확인하고, 고치고 싶은 곳은 직접 고치세요. 다 됐으면 맨 아래 초록 버튼을 누르세요.</p>

      {error && <div className="notice notice-error" role="alert">{error}</div>}

      <section className="card">
        <h2>① 워터마크 문구</h2>
        <label className="field-label" htmlFor="watermark">모든 장 맨 아래 가운데에 들어가는 글씨예요</label>
        <input
          id="watermark"
          type="text"
          value={watermark}
          onChange={(e) => changeWatermark(e.target.value)}
          placeholder="예) 맛집도둑 (비우면 워터마크 없음)"
          autoComplete="off"
        />
      </section>

      <h2 style={{ marginTop: 40 }}>② 장마다 사진·글 확인하기</h2>
      <div className="slide-editor">
        {slides.map((s, i) => {
          const cover = i === 0;
          const field = cover ? "title" : "body";
          return (
            <section className="card" key={i}>
              <span className="slide-num">{i + 1}번 장{cover ? " · 표지" : ""}</span>
              <SlidePreview
                ref={(el) => { nodes.current[i] = el; }}
                slide={s}
                index={i}
                watermark={watermark}
                overlay={
                  genIndex === i && (
                    <div className="preview-overlay" role="status">
                      <div className="spinner" />
                      <p>AI가 새 사진을 만드는 중이에요<br />1~2분쯤 걸려요</p>
                    </div>
                  )
                }
              />

              <div className="stack" style={{ marginTop: 24 }}>
                <div>
                  <label className="field-label" htmlFor={`text${i}`}>
                    {cover ? "표지 제목" : "본문"} <span className="muted small">(줄을 바꾸면 사진에서도 줄이 바뀌어요)</span>
                  </label>
                  <textarea
                    id={`text${i}`}
                    rows={cover ? 3 : 4}
                    value={s[field]}
                    onChange={(e) => update(i, { [field]: e.target.value })}
                  />
                </div>

                <div className="row">
                  <label className="btn btn-secondary" style={{ flex: "1 1 200px" }}>
                    🖼️ 사진 바꾸기
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => { replaceImage(i, e.target.files?.[0]); e.target.value = ""; }}
                    />
                  </label>
                  {s.image && (
                    <button className="btn btn-secondary" onClick={() => { update(i, { image: null }); forgetPrev(i); }}>
                      사진 빼기
                    </button>
                  )}
                  {/* AI 새 사진: 이 장의 사진을 같은 음식·다른 구도로 다시 만듦 (버튼을 누를 때만 1장씩 — 비용 보호) */}
                  {IMAGE_GEN_ENABLED && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => generateImage(i)}
                      disabled={genIndex !== null || !!busy}
                    >
                      {genIndex === i ? "새 사진 만드는 중…" : "✨ AI 새 사진"}
                    </button>
                  )}
                  {i in prevImages && genIndex !== i && (
                    <button className="btn btn-secondary" onClick={() => undoImage(i)} disabled={!!busy}>
                      ↩ 이전 사진으로
                    </button>
                  )}
                </div>

                {s.original && (
                  <details>
                    <summary className="muted" style={{ cursor: "pointer", padding: "8px 0" }}>원본 글 보기</summary>
                    <div className="original-text">{s.original}</div>
                  </details>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className="card" style={{ marginTop: 40 }}>
        <h2>③ 캡션(본문 글) 확인하기</h2>
        <textarea rows={10} value={caption} onChange={(e) => onChangeCaption(e.target.value)} aria-label="캡션" />
        <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }} onClick={copyCaption}>
          {copied ? "✓ 복사됐어요" : "📋 캡션 복사하기"}
        </button>
      </section>

      {results && (
        <section className="card" style={{ borderColor: "var(--ok)" }}>
          <h2>완성! 🎉</h2>
          <p>
            컴퓨터에는 <b>압축 파일(zip)</b>로 저장됐어요. 휴대폰에서는 아래 사진을 <b>길게 눌러 저장</b>하거나 저장 버튼을 누르세요.
          </p>
          <div className="thumbs">
            {results.map((u, i) => (
              <button
                key={u}
                className="thumb"
                style={{ border: 0, padding: 0, cursor: "pointer" }}
                onClick={() => triggerDownload(resultBlobs.current[i], `slide_${String(i + 1).padStart(2, "0")}.png`)}
                aria-label={`${i + 1}번째 장 저장`}
              >
                <img src={u} alt={`${i + 1}번째 장`} />
                <span>{i + 1} 저장</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onRemixAgain} disabled={!!busy}>🔄 글 다시 각색하기</button>
        <button className="btn btn-secondary" onClick={onRestart} disabled={!!busy}>처음으로</button>
      </div>

      <div className="approve-bar">
        <div className="inner">
          <button className="btn btn-ok btn-huge" onClick={approve} disabled={!!busy || genIndex !== null}>
            {busy ?? "✅ 승인하고 내려받기"}
          </button>
        </div>
      </div>
    </div>
  );
}
