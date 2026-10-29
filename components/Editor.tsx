"use client";

import { useRef, useState } from "react";
import { SlidePreview, TEMPLATES } from "./SlideCard";
import { resizeImage } from "@/lib/client-images";
import { downloadZip, renderSlides, triggerDownload } from "@/lib/export";
import type { Slide, TemplateId } from "@/lib/types";

type Props = {
  slides: Slide[];
  caption: string;
  onChangeSlides: (s: Slide[]) => void;
  onChangeCaption: (c: string) => void;
  onRemixAgain: () => void;
  onRestart: () => void;
};

export default function Editor({ slides, caption, onChangeSlides, onChangeCaption, onRemixAgain, onRestart }: Props) {
  const [template, setTemplate] = useState<TemplateId>("clean");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const resultBlobs = useRef<Blob[]>([]);

  const update = (i: number, patch: Partial<Slide>) => {
    onChangeSlides(slides.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setResults(null);
  };

  const replaceImage = async (i: number, file?: File) => {
    if (!file) return;
    try {
      update(i, { image: await resizeImage(file, 1600, 0.9) });
    } catch (e) {
      setError((e as Error).message);
    }
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
      <p className="lead">글을 읽어 보고, 고치고 싶은 곳은 칸을 눌러 직접 고치세요. 다 됐으면 맨 아래 초록 버튼을 누르세요.</p>

      {error && <div className="notice notice-error" role="alert">{error}</div>}

      <section className="card">
        <h2>① 디자인 고르기</h2>
        <div className="template-grid">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="template-option"
              style={t.swatch}
              aria-pressed={template === t.id}
              onClick={() => { setTemplate(t.id); setResults(null); }}
            >
              {template === t.id ? "✓ " : ""}{t.name}
            </button>
          ))}
        </div>
      </section>

      <h2 style={{ marginTop: 40 }}>② 장마다 글 확인하기</h2>
      <div className="slide-editor">
        {slides.map((s, i) => (
          <section className="card" key={i}>
            <span className="slide-num">{i + 1}번째 장</span>
            <SlidePreview
              ref={(el) => { nodes.current[i] = el; }}
              slide={s}
              index={i}
              total={slides.length}
              template={template}
            />

            <div className="stack" style={{ marginTop: 24 }}>
              <div>
                <label className="field-label" htmlFor={`t${i}`}>큰 제목</label>
                <textarea
                  id={`t${i}`}
                  rows={2}
                  style={{ minHeight: 0 }}
                  value={s.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label" htmlFor={`b${i}`}>설명 글</label>
                <textarea id={`b${i}`} rows={4} value={s.body} onChange={(e) => update(i, { body: e.target.value })} />
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
                  <button className="btn btn-secondary" onClick={() => update(i, { image: null })}>
                    사진 빼기
                  </button>
                )}
                {/* 2단계: AI로 슬라이드 이미지 새로 만들기 */}
                <button className="btn btn-secondary" disabled title="다음 업데이트에서 제공돼요">
                  ✨ AI 새 사진 (준비 중)
                </button>
              </div>

              {s.original && (
                <details>
                  <summary className="muted" style={{ cursor: "pointer", padding: "8px 0" }}>원본 글 보기</summary>
                  <div className="original-text">{s.original}</div>
                </details>
              )}
            </div>
          </section>
        ))}
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
          <button className="btn btn-ok btn-huge" onClick={approve} disabled={!!busy}>
            {busy ?? "✅ 승인하고 내려받기"}
          </button>
        </div>
      </div>
    </div>
  );
}
