"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { SLIDE_H, SLIDE_W, SlidePreview } from "./SlideCard";
import TemplateManager from "./TemplateManager";
import { resizeImage } from "@/lib/client-images";
import { IMAGE_GEN_ENABLED, makeAiPhoto } from "@/lib/slide-image";
import { downloadZip, renderSlides, triggerDownload } from "@/lib/export";
import { buildCaption } from "@/lib/caption";
import { buildDm, type DmContent } from "@/lib/dm";
import { loadFonts } from "@/lib/webfonts";
import {
  BUILTIN_TEMPLATES,
  DEFAULT_TEMPLATE,
  allTemplates,
  findTemplate,
  loadActiveId,
  saveActiveId,
  templateFontIds,
  type Template,
} from "@/lib/templates";
import type { Slide } from "@/lib/types";

type Props = {
  slides: Slide[];
  /** AI가 각색한 캡션 본문 (CTA·고지 문구 없이). 템플릿 CTA를 붙여 완성한다 */
  captionBody: string;
  /** AI가 만든 자동 DM 레시피 (인트로·CTA·고지는 템플릿대로 붙인다) */
  dmContent: DmContent | null;
  onChangeSlides: Dispatch<SetStateAction<Slide[]>>;
  onRemixAgain: () => void;
  onRestart: () => void;
};

export default function Editor({ slides, captionBody, dmContent, onChangeSlides, onRemixAgain, onRestart }: Props) {
  const [caption, setCaption] = useState("");
  const [dm, setDm] = useState("");
  const [dmCopied, setDmCopied] = useState(false);
  const [pinned, setPinned] = useState("");
  const [pinnedCopied, setPinnedCopied] = useState(false);
  const [watermark, setWatermark] = useState(DEFAULT_TEMPLATE.watermark.text);
  const [templates, setTemplates] = useState<Template[]>(BUILTIN_TEMPLATES);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE.id);
  const [showTemplates, setShowTemplates] = useState(false);
  const [askRestart, setAskRestart] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [genIndex, setGenIndex] = useState<number | null>(null);
  // AI 새 사진으로 바꾸기 전 사진 (되돌리기용)
  const [prevImages, setPrevImages] = useState<Record<number, string | null>>({});
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const resultBlobs = useRef<Blob[]>([]);

  const template = useMemo(() => findTemplate(templates, templateId), [templates, templateId]);

  // 저장해 둔 템플릿 목록을 불러와 지난번에 고른 템플릿으로 시작
  useEffect(() => {
    const list = allTemplates();
    setTemplates(list);
    applyTemplate(loadActiveId(), list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 템플릿이 쓰는 글꼴을 미리 내려받아 두어야 미리보기·저장본에 제대로 들어간다
  useEffect(() => {
    loadFonts(templateFontIds(template));
  }, [template]);

  // 캡션 = 템플릿의 CTA + AI 본문 + 쿠팡 고지. 본문이나 템플릿이 바뀌면 다시 맞춘다
  useEffect(() => {
    setCaption(buildCaption(captionBody, template));
    setResults(null);
  }, [captionBody, template]);

  // 자동 DM = 고정 인트로 + AI 레시피 + 버튼 안내 + 고지
  useEffect(() => {
    setDm(buildDm(dmContent, template));
  }, [dmContent, template]);

  // 고정 댓글은 템플릿에 적어 둔 문구 그대로
  useEffect(() => {
    setPinned(template.pinnedComment);
  }, [template]);

  /** 템플릿을 바꾸면 워터마크 문구도 그 템플릿에 저장된 문구로 맞춘다 */
  function applyTemplate(id: string, list: Template[] = templates) {
    const t = findTemplate(list, id);
    setTemplateId(t.id);
    saveActiveId(t.id);
    setWatermark(t.watermark.text);
    setResults(null);
  }

  const changeWatermark = (v: string) => {
    setWatermark(v);
    setResults(null);
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
      const image = await makeAiPhoto(current, slides[i].title, slides[i].body, SLIDE_W, SLIDE_H);
      setPrevImages((p) => ({ ...p, [i]: current }));
      update(i, { image });
    } catch (e) {
      setError(`${i + 1}번 장: ${(e as Error).message}`);
      window.scrollTo(0, 0);
    } finally {
      setGenIndex(null);
    }
  };

  /** 되돌릴 사진: 직전 사진이 없으면 각색 전 원본 사진 */
  const undoTarget = (i: number) => (i in prevImages ? prevImages[i] : (slides[i].sourceImage ?? null));
  const canUndo = (i: number) => i in prevImages || !!(slides[i].sourceImage && slides[i].sourceImage !== slides[i].image);

  const undoImage = (i: number) => {
    update(i, { image: undoTarget(i) });
    forgetPrev(i);
  };

  const copyText = async (text: string, mark: (v: boolean) => void, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      mark(true);
      setTimeout(() => mark(false), 2500);
    } catch {
      setError(`복사가 안 됐어요. ${what} 칸을 길게 눌러 직접 복사해 주세요.`);
    }
  };
  const copyCaption = () => copyText(caption, setCopied, "캡션");
  const copyDm = () => copyText(dm, setDmCopied, "DM");
  const copyPinned = () => copyText(pinned, setPinnedCopied, "고정 댓글");

  const approve = async () => {
    setError(null);
    setBusy(`완성본 만드는 중… (0 / ${slides.length}장)`);
    try {
      // 템플릿 글꼴이 다 내려와야 저장본에도 그 글꼴로 찍힌다
      await loadFonts(templateFontIds(template));
      const els = nodes.current.slice(0, slides.length).filter((n): n is HTMLDivElement => !!n);
      const blobs = await renderSlides(els, (d) => setBusy(`완성본 만드는 중… (${d} / ${slides.length}장)`));
      resultBlobs.current = blobs;
      setResults(blobs.map((b) => URL.createObjectURL(b)));
      await downloadZip(blobs, caption, pinned, dm);
    } catch (e) {
      console.error(e);
      setError("완성본을 만들다 문제가 생겼어요. 사진을 바꾸거나 다시 눌러 주세요.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-secondary btn-back" onClick={() => setAskRestart(true)} disabled={!!busy}>
          ← 처음으로
        </button>
      </div>

      {askRestart && (
        <div className="notice notice-info">
          <p style={{ margin: "0 0 12px" }}>
            처음 화면으로 돌아가면 <b>지금 만든 카드뉴스는 사라져요.</b> 괜찮으세요?
          </p>
          <div className="row">
            <button className="btn btn-secondary" onClick={() => setAskRestart(false)}>아니요, 계속 할게요</button>
            <button className="btn btn-primary" onClick={onRestart}>네, 처음으로</button>
          </div>
        </div>
      )}

      <h1>각색이 끝났어요!</h1>
      <p className="lead">사진과 글을 확인하고 고친 뒤, 아래 초록 버튼을 누르세요.</p>

      {error && <div className="notice notice-error" role="alert">{error}</div>}

      <div className="duo">
      <section className="card stack">
        <h2 style={{ margin: 0 }}>① 디자인 템플릿</h2>
        <div>
          <label className="field-label" htmlFor="template">글꼴·색·글상자를 미리 정해 둔 디자인이에요</label>
          <select id="template" value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.builtin ? " (기본 제공)" : ""}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-secondary btn-block" onClick={() => setShowTemplates(true)}>
          🎨 템플릿 만들기 · 고치기
        </button>
      </section>

      <section className="card">
        <h2>② 워터마크 문구</h2>
        <label className="field-label" htmlFor="watermark">모든 장에 들어가는 내 가게·채널 이름이에요</label>
        <input
          id="watermark"
          type="text"
          value={watermark}
          onChange={(e) => changeWatermark(e.target.value)}
          placeholder="예) 맛집도둑 (비우면 워터마크 없음)"
          autoComplete="off"
        />
      </section>
      </div>

      <h2 style={{ marginTop: 40, marginBottom: 6 }}>③ 장마다 사진·글 확인하기</h2>
      <p className="rail-hint">옆으로 밀어서 다음 장을 보세요 →</p>
      <div className="slide-rail">
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
                template={template}
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
                  {canUndo(i) && genIndex !== i && (
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

      <h2 style={{ marginTop: 40, marginBottom: 16 }}>④ 올릴 글 확인하기</h2>
      <div className="trio">
      <section className="card">
        <h2>캡션 (본문 글)</h2>
        <textarea rows={12} value={caption} onChange={(e) => { setCaption(e.target.value); setResults(null); }} aria-label="캡션" />
        <p className="muted small" style={{ margin: "12px 0 0" }}>
          맨 윗줄·맨 아랫줄 문구는 <b>템플릿</b>에서 바꿀 수 있어요. 여기서 고친 건 이번 한 번만 적용돼요.
        </p>
        <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }} onClick={copyCaption}>
          {copied ? "✓ 복사됐어요" : "📋 캡션 복사하기"}
        </button>
      </section>

      <section className="card">
        <h2>고정 댓글</h2>
        <p className="muted small" style={{ margin: "0 0 14px" }}>
          게시물 올린 뒤 <b>맨 위에 고정</b>해 둘 댓글이에요. 문구는 <b>템플릿</b>에서 바꿀 수 있어요.
        </p>
        <textarea
          rows={5}
          value={pinned}
          onChange={(e) => { setPinned(e.target.value); setResults(null); }}
          aria-label="고정 댓글"
        />
        <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }} onClick={copyPinned}>
          {pinnedCopied ? "✓ 복사됐어요" : "📋 고정 댓글 복사하기"}
        </button>
      </section>

      {dm && (
        <section className="card">
          <h2>자동 DM</h2>
          <p className="muted small" style={{ margin: "0 0 14px" }}>
            맨 윗줄·맨 아랫줄은 <b>템플릿</b>에서 바꿔요. <b>비밀재료가 뭔지는 일부러 안 적혀 있어요</b> —
            그걸 알려면 링크를 눌러야 하니까요.
          </p>
          <textarea rows={18} value={dm} onChange={(e) => { setDm(e.target.value); setResults(null); }} aria-label="자동 DM" />
          <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }} onClick={copyDm}>
            {dmCopied ? "✓ 복사됐어요" : "📋 DM 문구 복사하기"}
          </button>
        </section>
      )}
      </div>

      {results && (
        <section className="card" style={{ borderColor: "var(--ok)" }}>
          <h2>완성! 🎉</h2>
          <p>
            컴퓨터에는 <b>압축 파일(zip)</b>로 저장됐어요. 사진과 함께 <b>캡션·고정 댓글·자동 DM 글</b>도 들어 있어요. 휴대폰에서는 아래 사진을 <b>길게 눌러 저장</b>하거나 저장 버튼을 누르세요.
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
        <button className="btn btn-secondary" onClick={() => { setAskRestart(true); window.scrollTo(0, 0); }} disabled={!!busy}>처음으로</button>
      </div>

      <div className="approve-bar">
        <div className="inner">
          <button className="btn btn-ok btn-huge" onClick={approve} disabled={!!busy || genIndex !== null}>
            {busy ?? "✅ 승인하고 내려받기"}
          </button>
        </div>
      </div>

      {/* 템플릿 편집은 겹쳐 띄운다 — 다른 화면으로 넘어가면 고치던 카드뉴스가 사라지기 때문 */}
      {showTemplates && (
        <div className="overlay-page">
          <div className="page">
            <TemplateManager
              onClose={() => setShowTemplates(false)}
              onPick={(id) => {
                const list = allTemplates();
                setTemplates(list);
                applyTemplate(id, list);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
