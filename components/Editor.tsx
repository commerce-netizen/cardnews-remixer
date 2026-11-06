"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { SlidePreview } from "./SlideCard";
import { Toggle } from "./controls";
import { resizeImage } from "@/lib/client-images";
import { IMAGE_GEN_ENABLED, makeAiPhoto } from "@/lib/slide-image";
import { deviceKind, downloadZip, renderSlides, saveToGallery, triggerDownload } from "@/lib/export";
import { DISCLOSURE, buildCaption } from "@/lib/caption";
import { buildDm, type DmContent } from "@/lib/dm";
import { loadFonts } from "@/lib/webfonts";
import { ROLE_LABEL, SLIDE_W, newBlock, slideHeight, styleOf, type TextBlock } from "@/lib/layout";
import {
  BUILTIN_TEMPLATES,
  DEFAULT_TEMPLATE,
  allTemplates,
  applyTemplateToBlocks,
  blockFontNeeds,
  findTemplate,
  loadActiveId,
  saveActiveId,
  type Template,
  type WatermarkStyle,
} from "@/lib/templates";
import type { Slide } from "@/lib/types";
import { comboSlides, dropLayout, slideText, syncField } from "@/lib/magazine-client";

type Props = {
  /** 음식·레시피 카드뉴스인지 (false = 정치·시사·패션 등 일반 → 캡션 CTA·고정 댓글·자동 DM 없음) */
  recipe: boolean;
  /** 쿠팡 파트너스·광고 게시물인지 ([광고] 표시·고지 기본값) */
  commerce: boolean;
  slides: Slide[];
  /** AI가 각색한 캡션 본문 (CTA·고지 없이) */
  captionBody: string;
  /** AI가 만든 자동 DM 레시피 */
  dmContent: DmContent | null;
  onChangeSlides: Dispatch<SetStateAction<Slide[]>>;
  onRemixAgain: () => void;
  onRestart: () => void;
};

export default function Editor({ recipe, commerce, slides, captionBody, dmContent, onChangeSlides, onRemixAgain, onRestart }: Props) {
  const [caption, setCaption] = useState("");
  const [dm, setDm] = useState("");
  const [dmCopied, setDmCopied] = useState(false);
  const [pinned, setPinned] = useState("");
  const [pinnedCopied, setPinnedCopied] = useState(false);
  const [templates, setTemplates] = useState<Template[]>(BUILTIN_TEMPLATES);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE.id);
  const [watermark, setWatermark] = useState<WatermarkStyle>(DEFAULT_TEMPLATE.watermark);
  const [adLabel, setAdLabel] = useState(commerce);
  // 일반 카드뉴스: 쿠팡 파트너스 고지를 캡션에 붙일지 (레시피는 항상 붙음)
  const [disclose, setDisclose] = useState(commerce);
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

  // 저장해 둔 템플릿 목록(기본 제공 + 내가 만든 것)을 불러와 지난번에 고른 템플릿으로 시작
  useEffect(() => {
    const list = allTemplates();
    setTemplates(list);
    // 슬라이드는 만들 때 이미 이 템플릿으로 그려졌다 — 모양·워터마크만 맞춘다
    const t = findTemplate(list, loadActiveId());
    setTemplateId(t.id);
    setWatermark({ ...t.watermark });
    setAdLabel(t.adLabel && commerce);
    if (!t.combo) setSlides((prev) => prev.map((s) => (s.layout ? s : { ...s, blocks: applyTemplateToBlocks(s.blocks, t, true) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 쓰는 글꼴을 미리 내려받아 두어야 미리보기·저장본에 제대로 들어간다
  const fontKey = useMemo(
    () => JSON.stringify([...slides.flatMap((s) => blockFontNeeds(s.blocks)), watermark.fontId]),
    [slides, watermark.fontId],
  );
  useEffect(() => {
    loadFonts(JSON.parse(fontKey));
  }, [fontKey]);

  // 캡션: 레시피 = 템플릿 CTA + AI 본문 + 쿠팡 고지 / 일반 = AI 캡션 (+ 고지)
  useEffect(() => {
    setCaption(
      recipe ? buildCaption(captionBody, template) : [captionBody.trim(), disclose ? DISCLOSURE : ""].filter(Boolean).join("\n\n"),
    );
    setResults(null);
  }, [captionBody, template, recipe, disclose]);

  useEffect(() => {
    setDm(recipe ? buildDm(dmContent, template) : "");
    setPinned(recipe ? template.pinnedComment : "");
  }, [dmContent, template, recipe]);

  const setSlides = (fn: (prev: Slide[]) => Slide[]) => {
    onChangeSlides(fn);
    setResults(null);
  };

  /** 기본(글 상자형) 장: 1번 장은 제목 상자, 2번 장부터 본문 상자 */
  const classicBlocks = (i: number, text: string, t: Template) =>
    i === 0 ? [newBlock("title", text, styleOf(t.styles.title))] : [newBlock("body", text, styleOf(t.styles.body))];

  /**
   * 템플릿 고르기.
   * 글 상자형 = 모든 장의 글 상자에 역할별 모양(글꼴·크기·색·위치)을 입힌다.
   * 조합 = 1번 장 썸네일, 나머지 내지(AI가 칸에 맞게 글을 다시 나눔), 맨 끝 마지막 장(적어 둔 글 그대로).
   */
  async function applyTemplate(id: string, list: Template[] = templates) {
    const t = findTemplate(list, id);
    setTemplateId(t.id);
    setResults(null);
    saveActiveId(t.id);
    setWatermark({ ...t.watermark });
    setAdLabel(t.adLabel && commerce);
    if (t.combo) {
      setBusy("템플릿에 맞게 글을 나누는 중…");
      try {
        // 템플릿을 바꾸면 장마다 정했던 글꼴·크기는 새 템플릿 것으로 돌아간다
        const content = slides.filter((x) => !x.fixedLast).map((x) => ({ ...x, fontOverride: undefined, sizeScale: undefined }));
        const next = await comboSlides(content, t.combo, t.watermark.text, (i) => !!(content[i].image || content[i].sourceImage));
        setSlides(() => next);
      } finally {
        setBusy(null);
      }
      return;
    }
    setSlides((prev) =>
      prev.filter((s) => !s.fixedLast).map((s0, i) => ({ ...s0, fontOverride: undefined, sizeScale: undefined })).map((s, i) =>
        s.layout
          ? { ...dropLayout(s), blocks: classicBlocks(i, slideText(s), t) }
          : { ...s, blocks: applyTemplateToBlocks(s.blocks, t, true) },
      ),
    );
  }

  const updateSlide = (i: number, patch: Partial<Slide>) => setSlides((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const updateBlock = (i: number, id: string, patch: Partial<TextBlock>) =>
    setSlides((prev) =>
      prev.map((s, j) => {
        if (j !== i) return s;
        const next = { ...s, blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) };
        // 매거진 장: 고친 글을 칸 값에도 넣어 둔다 (색만 바꿔 다시 그려도 남게)
        return patch.text !== undefined ? syncField(next, id, patch.text) : next;
      }),
    );

  const forgetPrev = (i: number) =>
    setPrevImages((p) => {
      const next = { ...p };
      delete next[i];
      return next;
    });

  const replaceImage = async (i: number, file?: File) => {
    if (!file) return;
    try {
      updateSlide(i, { image: await resizeImage(file, 1600, 0.9) });
      forgetPrev(i);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const generateImage = async (i: number) => {
    setError(null);
    setGenIndex(i);
    const s = slides[i];
    const current = s.image;
    try {
      const text = s.blocks.map((b) => b.text).join("\n");
      // 원본 사진에서 다시 만든다 (같은 음식·색감, 구도만 변경, 글자 제거). 원본이 없으면 지금 사진, 그것도 없으면 글로
      const from = s.sourceImage ?? current;
      const image = await makeAiPhoto(from, text, "", SLIDE_W, slideHeight(s.ratio));
      setPrevImages((p) => ({ ...p, [i]: current }));
      updateSlide(i, { image });
    } catch (e) {
      setError(`${i + 1}번 장: ${(e as Error).message}`);
      window.scrollTo(0, 0);
    } finally {
      setGenIndex(null);
    }
  };

  /** 직전 사진으로 되돌리기 (원본 사진으로는 되돌리지 않는다 — 글씨가 박혀 겹치고 저작권 문제도 있음) */
  const canUndo = (i: number) => i in prevImages;
  const undoImage = (i: number) => {
    updateSlide(i, { image: prevImages[i] ?? null });
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

  const device = typeof window === "undefined" ? "desktop" : deviceKind();
  const [saved, setSaved] = useState(false);
  const saveAgain = async () => {
    setError(null);
    try {
      const r = await saveToGallery(resultBlobs.current);
      if (r !== "cancelled") setSaved(true);
    } catch {
      setError("사진 저장 창을 열지 못했어요. 아래 사진을 길게 눌러 '사진 앱에 저장'으로 저장해 주세요.");
    }
  };

  const approve = async () => {
    setSaved(false);
    setError(null);
    setBusy(`완성본 만드는 중… (0 / ${slides.length}장)`);
    try {
      await loadFonts(JSON.parse(fontKey));
      const els = nodes.current.slice(0, slides.length).filter((n): n is HTMLDivElement => !!n);
      const blobs = await renderSlides(els, (d) => setBusy(`완성본 만드는 중… (${d} / ${slides.length}장)`));
      resultBlobs.current = blobs;
      setResults(blobs.map((b) => URL.createObjectURL(b)));
      if (device === "desktop") {
        await downloadZip(blobs, caption, pinned, dm);
      } else if (device === "android") {
        // 갤럭시: 압축 파일 대신 사진을 한 장씩 → 갤러리 'Download' 앨범
        await saveToGallery(blobs);
        setSaved(true);
      }
      // 아이폰: 사진 만드는 사이 '누른 순간'이 지나 공유 창을 바로 못 연다 → 아래 '사진 앱에 저장' 버튼을 한 번 더 누르게
      setTimeout(() => document.getElementById("result-card")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
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
      <p className="lead">
        완성본을 확인하고 글만 고치면 돼요. 디자인은 <b>디자인 템플릿</b> 탭에서 바꿀 수 있어요. 다 됐으면 아래 초록 버튼을 누르세요.
      </p>

      {error && <div className="notice notice-error" role="alert">{error}</div>}

      <section className="card stack">
        <div>
          <label className="field-label" htmlFor="template">템플릿</label>
          <select id="template" value={templateId} onChange={(e) => applyTemplate(e.target.value)} disabled={!!busy}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.builtin ? " (기본 제공)" : ""}</option>
            ))}
          </select>
        </div>
        <Toggle label="[광고] 표시" hint="쿠팡 파트너스·협찬 게시물이면 꼭 켜 두세요" checked={adLabel} onChange={(v) => { setAdLabel(v); setResults(null); }} />
        {!recipe && <Toggle label="캡션에 쿠팡 파트너스 고지 붙이기" checked={disclose} onChange={setDisclose} />}
      </section>

      <h2 style={{ marginTop: 32, marginBottom: 6 }}>완성본 · 글 고치기</h2>
      <p className="rail-hint">옆으로 밀어서 다음 장을 보세요 →</p>
      <div className="slide-rail">
        {slides.map((s, i) => (
          <section className="card" key={i}>
            <span className="slide-num">{i + 1}번 장{i === 0 ? " · 썸네일" : s.fixedLast ? " · 마지막 장" : ""}</span>
            <SlidePreview
              ref={(el) => { nodes.current[i] = el; }}
              slide={s}
              watermark={watermark}
              adLabel={adLabel}
              overlay={
                genIndex === i && (
                  <div className="preview-overlay" role="status">
                    <div className="spinner" />
                    <p>AI가 새 사진을 만드는 중이에요<br />1~2분쯤 걸려요</p>
                  </div>
                )
              }
            />

            <div className="stack" style={{ marginTop: 20 }}>
              {s.blocks
                .filter((b) => b.role !== "handle" && (b.field || !s.layout))
                .map((b) => (
                  <div key={b.id} className="block-field">
                    <span className="field-label">{ROLE_LABEL[b.role]}</span>
                    <textarea
                      rows={Math.min(5, Math.max(2, b.text.split("\n").length))}
                      value={b.text}
                      onChange={(e) => updateBlock(i, b.id, { text: e.target.value })}
                      aria-label={`${ROLE_LABEL[b.role]} 글`}
                    />
                  </div>
                ))}

              <div className="row">
                <label className="btn btn-secondary" style={{ flex: "1 1 200px" }}>
                  🖼️ 사진 바꾸기
                  <input type="file" accept="image/*" hidden onChange={(e) => { replaceImage(i, e.target.files?.[0]); e.target.value = ""; }} />
                </label>
                {s.image && (
                  <button className="btn btn-secondary" onClick={() => { updateSlide(i, { image: null }); forgetPrev(i); }}>
                    사진 빼기
                  </button>
                )}
                {IMAGE_GEN_ENABLED && (s.image || s.sourceImage) && (
                  <button className="btn btn-secondary" onClick={() => generateImage(i)} disabled={genIndex !== null || !!busy}>
                    {genIndex === i ? "새 사진 만드는 중…" : s.image ? "✨ AI 새 사진 다시 만들기" : "✨ AI 새 사진 만들기"}
                  </button>
                )}
                {canUndo(i) && genIndex !== i && (
                  <button className="btn btn-secondary" onClick={() => undoImage(i)} disabled={!!busy}>↩ 이전 사진으로</button>
                )}
              </div>
              {!s.image && s.sourceImage && genIndex !== i && (
                <p className="muted small" style={{ margin: 0 }}>
                  이 장은 아직 사진이 없어요. <b>✨ AI 새 사진 만들기</b>를 눌러 주세요.
                </p>
              )}
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

      <h2 style={{ marginTop: 40, marginBottom: 16 }}>올릴 글 확인하기</h2>
      <div className="trio">
        <section className="card">
          <h2>캡션 (본문 글)</h2>
          {recipe && (
            <p className="muted small" style={{ margin: "0 0 14px" }}>
              맨 윗줄·맨 아랫줄 문구는 <b>템플릿</b>에서 바꿀 수 있어요. 여기서 고친 건 이번 한 번만 적용돼요.
            </p>
          )}
          <textarea rows={12} value={caption} onChange={(e) => { setCaption(e.target.value); setResults(null); }} aria-label="캡션" />
          <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }} onClick={() => copyText(caption, setCopied, "캡션")}>
            {copied ? "✓ 복사됐어요" : "📋 캡션 복사하기"}
          </button>
        </section>

        {recipe && (
          <section className="card">
            <h2>고정 댓글</h2>
            <p className="muted small" style={{ margin: "0 0 14px" }}>
              게시물 올린 뒤 <b>맨 위에 고정</b>해 둘 댓글이에요. 문구는 <b>템플릿</b>에서 바꿀 수 있어요.
            </p>
            <textarea rows={5} value={pinned} onChange={(e) => { setPinned(e.target.value); setResults(null); }} aria-label="고정 댓글" />
            <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }} onClick={() => copyText(pinned, setPinnedCopied, "고정 댓글")}>
              {pinnedCopied ? "✓ 복사됐어요" : "📋 고정 댓글 복사하기"}
            </button>
          </section>
        )}

        {dm && (
          <section className="card">
            <h2>자동 DM</h2>
            <p className="muted small" style={{ margin: "0 0 14px" }}>
              맨 윗줄·맨 아랫줄은 <b>템플릿</b>에서 바꿔요. <b>비밀재료가 뭔지는 일부러 안 적혀 있어요</b> —
              그걸 알려면 링크를 눌러야 하니까요.
            </p>
            <textarea rows={18} value={dm} onChange={(e) => { setDm(e.target.value); setResults(null); }} aria-label="자동 DM" />
            <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }} onClick={() => copyText(dm, setDmCopied, "DM")}>
              {dmCopied ? "✓ 복사됐어요" : "📋 DM 문구 복사하기"}
            </button>
          </section>
        )}
      </div>

      {results && (
        <section className="card" id="result-card" style={{ borderColor: "var(--ok)" }}>
          <h2>완성! 🎉</h2>
          {device === "desktop" ? (
            <p>
              <b>압축 파일(zip)</b>로 저장됐어요. 사진 {results.length}장과 함께 <b>캡션{recipe ? "·고정 댓글·자동 DM" : ""} 글</b>도 들어 있어요.
            </p>
          ) : (
            <>
              <button className="btn btn-ok btn-huge btn-block" onClick={saveAgain}>
                📲 사진 {results.length}장 {device === "ios" ? "사진 앱에" : "갤러리에"} 저장하기
              </button>
              <p className="muted small" style={{ margin: "12px 0 0" }}>
                {device === "ios"
                  ? <>누르면 공유 창이 떠요. <b>&lsquo;이미지 {results.length}개 저장&rsquo;</b>을 누르면 사진 앱에 한 번에 들어가요.</>
                  : saved
                    ? <>갤러리 앱의 <b>&lsquo;Download&rsquo;(다운로드) 앨범</b>에 {results.length}장이 저장됐어요. 안 보이면 위 버튼을 다시 눌러 주세요.</>
                    : <>누르면 사진이 한 장씩 저장돼요. 갤러리 앱의 <b>&lsquo;Download&rsquo;</b> 앨범에서 보여요.</>}
                {" "}캡션{recipe ? "·고정 댓글·DM" : ""}은 위 <b>복사하기</b> 버튼으로 옮기세요.
              </p>
            </>
          )}
          <div className="thumbs" style={{ marginTop: 16 }}>
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

    </div>
  );
}
