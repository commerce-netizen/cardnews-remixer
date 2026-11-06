"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { SlidePreview } from "./SlideCard";
import TemplateManager from "./TemplateManager";
import StylePanel from "./StylePanel";
import { ColorField, Range, Toggle } from "./controls";
import FontPicker from "./FontPicker";
import { resizeImage } from "@/lib/client-images";
import { IMAGE_GEN_ENABLED, makeAiPhoto } from "@/lib/slide-image";
import { downloadZip, renderSlides, triggerDownload } from "@/lib/export";
import { DISCLOSURE, buildCaption } from "@/lib/caption";
import { buildDm, type DmContent } from "@/lib/dm";
import { loadFonts } from "@/lib/webfonts";
import {
  ROLES,
  ROLE_LABEL,
  SLIDE_W,
  newBlock,
  slideHeight,
  styleOf,
  type TextBlock,
  type TextRole,
} from "@/lib/layout";
import {
  BUILTIN_TEMPLATES,
  DEFAULT_TEMPLATE,
  allTemplates,
  applyTemplateToBlocks,
  blockFontNeeds,
  duplicateTemplate,
  findTemplate,
  loadActiveId,
  loadUserTemplates,
  saveActiveId,
  saveUserTemplates,
  stylesFromBlocks,
  uniqueName,
  type Template,
  type WatermarkStyle,
} from "@/lib/templates";
import type { Slide } from "@/lib/types";
import { DEFAULT_ACCENT, KIND_LABEL, layoutsOf, type LayoutKind } from "@/lib/magazine";
import { comboSlides, dropLayout, fillSlide, redraw, slideText, syncField } from "@/lib/magazine-client";
import type { PageSpec } from "@/lib/page-templates";

/** 포인트 색 고르기 보기 */
const ACCENTS = ["#e5481c", "#2b6fff", "#0b4a8f", "#2fb79a", "#f2b705", "#d6336c", "#141414"];
const KINDS: LayoutKind[] = ["cover", "inner", "last"];

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

type Sel = { slide: number; id: string } | null;

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
  const [showTemplates, setShowTemplates] = useState(false);
  const [askRestart, setAskRestart] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [results, setResults] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [genIndex, setGenIndex] = useState<number | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [applyPos, setApplyPos] = useState(false);
  const [saveName, setSaveName] = useState("");
  // AI 새 사진으로 바꾸기 전 사진 (되돌리기용)
  const [prevImages, setPrevImages] = useState<Record<number, string | null>>({});
  // 매거진 레이아웃: 포인트 색, 양식을 새로 채우는 중인 장
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [layoutIndex, setLayoutIndex] = useState<number | null>(null);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const editorRef = useRef<HTMLElement>(null);
  const resultBlobs = useRef<Blob[]>([]);

  const template = useMemo(() => findTemplate(templates, templateId), [templates, templateId]);

  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2500);
  };

  // 저장해 둔 템플릿 목록(기본 제공 + 내가 만든 것)을 불러와 지난번에 고른 템플릿으로 시작
  useEffect(() => {
    const list = allTemplates();
    setTemplates(list);
    // 슬라이드는 만들 때 이미 이 템플릿으로 그려졌다 — 모양·워터마크만 맞춘다
    const t = findTemplate(list, loadActiveId());
    setTemplateId(t.id);
    setWatermark({ ...t.watermark });
    setAdLabel(t.adLabel && commerce);
    if (t.combo) setAccent(t.combo.accent);
    else setSlides((prev) => prev.map((s) => (s.layout ? s : { ...s, blocks: applyTemplateToBlocks(s.blocks, t, true) })));
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
      setAccent(t.combo.accent);
      setBusy("템플릿에 맞게 글을 나누는 중…");
      try {
        const content = slides.filter((x) => !x.fixedLast);
        const next = await comboSlides(content, t.combo, t.watermark.text, (i) => !!(content[i].image || content[i].sourceImage));
        setSlides(() => next);
      } finally {
        setBusy(null);
      }
      return;
    }
    setSlides((prev) =>
      prev.filter((s) => !s.fixedLast).map((s, i) =>
        s.layout
          ? { ...dropLayout(s), blocks: classicBlocks(i, slideText(s), t) }
          : { ...s, blocks: applyTemplateToBlocks(s.blocks, t, true) },
      ),
    );
  }

  /** 한 장의 템플릿 바꾸기 — AI가 그 장 글을 새 템플릿 칸에 맞게 다시 나눈다 */
  async function changeLayout(i: number, id: string) {
    const s = slides[i];
    setError(null);
    if (!id) {
      setSlides((prev) => prev.map((x, j) => (j === i ? { ...dropLayout(x), blocks: classicBlocks(i, slideText(x), template) } : x)));
      return;
    }
    setLayoutIndex(i);
    try {
      const next = await fillSlide(s, specFor(id), { accent, handle: watermark.text }, {
        context: slides.map((x, j) => `[${j + 1}장] ${slideText(x)}`).join("\n"),
        hasPhoto: !!(s.image || s.sourceImage),
      }, true);
      setSlides((prev) => prev.map((x, j) => (j === i ? next : x)));
      setSel(null);
    } catch (e) {
      setError(`${i + 1}번 장: ${(e as Error).message}`);
    } finally {
      setLayoutIndex(null);
    }
  }

  /** 이 양식에 지금 템플릿 조합에서 고친 모양이 있으면 그걸로 */
  const specFor = (layout: string): PageSpec => {
    const c = template.combo;
    return [c?.cover, c?.inner, c?.last].find((x) => x?.layout === layout) ?? { layout };
  };

  /** 포인트 색 바꾸기 — AI 없이 다시 그린다 */
  const changeAccent = (v: string) => {
    setAccent(v);
    setSlides((prev) => prev.map((s) => redraw(s, s.layout ? specFor(s.layout) : undefined, { accent: v, handle: watermark.text })));
  };
  const hasLayout = slides.some((s) => s.layout);

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

  const addBlock = (i: number) => {
    const role: TextRole = i === 0 ? "title" : "body";
    const b = newBlock(role, "새 글", styleOf(template.styles[role] ?? template.styles.body));
    setSlides((prev) => prev.map((s, j) => (j === i ? { ...s, blocks: [...s.blocks, b] } : s)));
    setSel({ slide: i, id: b.id });
  };
  const removeBlock = (i: number, id: string) => {
    setSlides((prev) => prev.map((s, j) => (j === i ? { ...s, blocks: s.blocks.filter((b) => b.id !== id) } : s)));
    setSel(null);
  };
  const duplicateBlock = (i: number, b: TextBlock) => {
    const c = { ...newBlock(b.role, b.text, styleOf(b)), accentLines: b.accentLines, y: Math.min(95, b.y + 4) };
    setSlides((prev) => prev.map((s, j) => (j === i ? { ...s, blocks: [...s.blocks, c] } : s)));
    setSel({ slide: i, id: c.id });
  };

  /** 고른 글 상자의 모양을 같은 역할의 모든 글 상자에 */
  const applyToRole = (b: TextBlock) => {
    const st = styleOf(b, applyPos);
    let n = 0;
    setSlides((prev) =>
      prev.map((s) => ({
        ...s,
        blocks: s.blocks.map((x) => (x.role === b.role && x.id !== b.id ? (n++, { ...x, ...st }) : x)),
      })),
    );
    say(`모든 장의 '${ROLE_LABEL[b.role]}'에 같은 모양을 입혔어요.`);
  };

  /** 지금 디자인을 내 템플릿으로 저장 */
  const saveAsTemplate = () => {
    const users = loadUserTemplates();
    const all = [...BUILTIN_TEMPLATES, ...users];
    const name = saveName.trim() || uniqueName(all, "내 디자인");
    const base = duplicateTemplate(template, name);
    const t: Template = {
      ...base,
      styles: stylesFromBlocks(slides.flatMap((s) => s.blocks), template.styles),
      watermark: { ...watermark },
      adLabel,
    };
    saveUserTemplates([...users, t]);
    const list = allTemplates();
    setTemplates(list);
    setTemplateId(t.id);
    saveActiveId(t.id);
    setSaveName("");
    say(`'${name}' 템플릿으로 저장했어요. 다음 카드뉴스에도 바로 쓸 수 있어요.`);
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

  const approve = async () => {
    setError(null);
    setSel(null);
    setBusy(`완성본 만드는 중… (0 / ${slides.length}장)`);
    try {
      await loadFonts(JSON.parse(fontKey));
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

  const openStyle = (i: number, id: string) => {
    setSel({ slide: i, id });
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const selected = sel ? slides[sel.slide]?.blocks.find((b) => b.id === sel.id) ?? null : null;

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
        글을 <b>누르면</b> 글꼴·크기·색·위치를 바꿀 수 있고, <b>끌면</b> 옮겨져요. 다 고친 뒤 아래 초록 버튼을 누르세요.
      </p>

      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {toast && <div className="notice notice-info" role="status">{toast}</div>}

      <div className="duo">
        <section className="card stack">
          <h2 style={{ margin: 0 }}>① 글 디자인 템플릿</h2>
          <div>
            <label className="field-label" htmlFor="template">역할(제목·본문…)별 글꼴·크기·색·위치를 한 번에 입혀요</label>
            <select id="template" value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.builtin ? " (기본 제공)" : ""}</option>
              ))}
            </select>
          </div>
          {hasLayout && <ColorField label="포인트 색 (띠·번호·강조)" value={accent} presets={ACCENTS} onChange={changeAccent} />}
          <button className="btn btn-secondary btn-block" onClick={() => setShowTemplates(true)}>
            🎨 템플릿 만들기 · 고치기
          </button>
          <div className="save-tpl">
            <input type="text" placeholder="지금 디자인을 템플릿으로 저장 (이름)" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
            <button className="btn btn-primary" onClick={saveAsTemplate}>💾 저장</button>
          </div>
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>② 워터마크 · 표시</h2>
          <div>
            <label className="field-label" htmlFor="watermark">모든 장에 들어가는 내 채널 이름</label>
            <input
              id="watermark"
              type="text"
              value={watermark.text}
              onChange={(e) => { setWatermark({ ...watermark, text: e.target.value }); setResults(null); }}
              placeholder="예) @내계정 (비우면 워터마크 없음)"
              autoComplete="off"
            />
          </div>
          <div>
            <span className="field-label">워터마크 글꼴</span>
            <FontPicker value={watermark.fontId} onChange={(fontId) => setWatermark({ ...watermark, fontId })} sample={watermark.text} />
          </div>
          <Range label="워터마크 크기" value={watermark.size} min={14} max={80} unit="px" onChange={(size) => setWatermark({ ...watermark, size })} />
          <Toggle label="[광고] 표시" hint="쿠팡 파트너스·협찬 게시물이면 꼭 켜 두세요" checked={adLabel} onChange={(v) => { setAdLabel(v); setResults(null); }} />
          {!recipe && (
            <Toggle label="캡션에 쿠팡 파트너스 고지 붙이기" checked={disclose} onChange={setDisclose} />
          )}
        </section>
      </div>

      <h2 style={{ marginTop: 40, marginBottom: 6 }}>③ 장마다 사진·글 고치기</h2>
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
              selectedId={sel?.slide === i ? sel.id : null}
              onSelect={(id) => setSel(id ? { slide: i, id } : null)}
              onMoveBlock={(id, patch) => updateBlock(i, id, patch)}
              overlay={
                layoutIndex === i ? (
                  <div className="preview-overlay" role="status">
                    <div className="spinner" />
                    <p>템플릿에 맞게 글을 나누는 중이에요</p>
                  </div>
                ) : genIndex === i && (
                  <div className="preview-overlay" role="status">
                    <div className="spinner" />
                    <p>AI가 새 사진을 만드는 중이에요<br />1~2분쯤 걸려요</p>
                  </div>
                )
              }
            />

            <div className="stack" style={{ marginTop: 20 }}>
              <div>
                <label className="field-label" htmlFor={`layout-${i}`}>이 장 템플릿</label>
                <select
                  id={`layout-${i}`}
                  value={s.layout ?? ""}
                  disabled={layoutIndex !== null || !!busy}
                  onChange={(e) => changeLayout(i, e.target.value)}
                >
                  <option value="">글 상자만 (기본)</option>
                  {KINDS.map((k) => (
                    <optgroup key={k} label={KIND_LABEL[k]}>
                      {layoutsOf(k).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              {s.blocks.map((b) => {
                const on = sel?.slide === i && sel.id === b.id;
                return (
                  <div key={b.id} className={`block-field${on ? " on" : ""}`}>
                    <div className="block-field-head">
                      <select
                        value={b.role}
                        onChange={(e) => updateBlock(i, b.id, { role: e.target.value as TextRole })}
                        aria-label="글 역할"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                      <button className="btn btn-secondary btn-sm" onClick={() => (on ? setSel(null) : openStyle(i, b.id))}>
                        {on ? "닫기" : "🎨 모양"}
                      </button>
                    </div>
                    <textarea
                      rows={Math.min(5, Math.max(2, b.text.split("\n").length))}
                      value={b.role === "handle" && watermark.text.trim() ? watermark.text : b.text}
                      disabled={b.role === "handle" && !!watermark.text.trim()}
                      onFocus={() => setSel({ slide: i, id: b.id })}
                      onChange={(e) => updateBlock(i, b.id, { text: e.target.value })}
                      aria-label={`${ROLE_LABEL[b.role]} 글`}
                    />
                  </div>
                );
              })}
              <button className="btn btn-secondary" onClick={() => addBlock(i)}>➕ 글 상자 추가</button>

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

      {/* 고른 글 상자 모양 고치기 — 아래에 붙어 따라다님 */}
      {selected && sel && (
        <section className="card stack block-editor" ref={editorRef}>
          <div className="block-editor-head">
            <h2 style={{ margin: 0 }}>
              {sel.slide + 1}번 장 · {ROLE_LABEL[selected.role]} 모양
            </h2>
            <button className="btn btn-secondary btn-sm" onClick={() => setSel(null)}>닫기 ✕</button>
          </div>
          <div className="split">
            <div className="sticky">
              <SlidePreview
                slide={slides[sel.slide]}
                watermark={watermark}
                adLabel={adLabel}
                selectedId={sel.id}
                onSelect={(id) => id && setSel({ slide: sel.slide, id })}
                onMoveBlock={(id, patch) => updateBlock(sel.slide, id, patch)}
              />
            </div>
            <div className="stack">
          <StylePanel
            style={selected}
            sample={selected.text.split("\n")[0]}
            lines={selected.text.split("\n").length}
            onChange={(patch) => updateBlock(sel.slide, selected.id, patch)}
          />
          <div className="stack sub">
            <Toggle label="위치·크기도 함께 적용" checked={applyPos} onChange={setApplyPos} />
            <div className="row">
              <button className="btn btn-primary" onClick={() => applyToRole(selected)}>
                모든 장의 &apos;{ROLE_LABEL[selected.role]}&apos;에 이 모양 적용
              </button>
              <button className="btn btn-secondary" onClick={() => duplicateBlock(sel.slide, selected)}>글 상자 복제</button>
              <button className="btn btn-secondary" onClick={() => removeBlock(sel.slide, selected.id)}>글 상자 지우기</button>
            </div>
          </div>
            </div>
          </div>
        </section>
      )}

      <h2 style={{ marginTop: 40, marginBottom: 16 }}>④ 올릴 글 확인하기</h2>
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
        <section className="card" style={{ borderColor: "var(--ok)" }}>
          <h2>완성! 🎉</h2>
          <p>
            컴퓨터에는 <b>압축 파일(zip)</b>로 저장됐어요. 사진과 함께 <b>캡션{recipe ? "·고정 댓글·자동 DM" : ""} 글</b>도 들어 있어요. 휴대폰에서는 아래 사진을 <b>길게 눌러 저장</b>하거나 저장 버튼을 누르세요.
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
              onClose={() => {
                setShowTemplates(false);
              }}
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
