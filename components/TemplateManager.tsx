"use client";

import { useEffect, useMemo, useState } from "react";
import { SlidePreview } from "./SlideCard";
import StylePanel from "./StylePanel";
import FontPicker from "./FontPicker";
import { ColorField, Range, Seg, TEXT_COLORS, Toggle } from "./controls";
import { buildCaption } from "@/lib/caption";
import { buildDm, type DmContent } from "@/lib/dm";
import { loadFonts } from "@/lib/webfonts";
import { ROLES, ROLE_LABEL, type BlockStyle, type TextBlock, type TextRole } from "@/lib/layout";
import {
  BUILTIN_TEMPLATES,
  DEFAULT_TEMPLATE,
  WATERMARK_POS_LABEL,
  allTemplates,
  duplicateTemplate,
  loadActiveId,
  saveActiveId,
  saveUserTemplates,
  templateFontIds,
  uniqueName,
  type CaptionStyle,
  type DmStyle,
  type Template,
  type WatermarkStyle,
} from "@/lib/templates";
import type { Slide } from "@/lib/types";
import { KIND_LABEL, getLayout, layoutsOf, type Fields, type LayoutKind } from "@/lib/magazine";
import { DEFAULT_COMBO, favFirst, loadFavorites, samplePage, saveFavorites, type Combo, type PageSpec } from "@/lib/page-templates";

const ACCENTS = ["#e5481c", "#2b6fff", "#0b4a8f", "#2fb79a", "#f2b705", "#d6336c", "#141414"];
/** 템플릿 미리보기에 쓰는 글꼴 */
const MAG_FONTS = [500, 700, 800].map((w) => ({ id: "Pretendard", w })).concat([{ id: "NanumMyeongjo", w: 400 }]);
const KINDS: LayoutKind[] = ["cover", "inner", "last"];
const STEP_LABEL: Record<LayoutKind, string> = { cover: "① 썸네일", inner: "② 내지", last: "③ 마지막 장" };
const BG_COLORS = ["#ffffff", "#f7f6f2", "#efe9df", "#000000", "#1d1d1d", "#0b1f44"];

const lookOf = (t: Template, accent?: string) => ({ accent: accent ?? t.combo?.accent ?? "#e5481c", handle: t.watermark.text || "@my_account" });

/** 조합의 한 장 미리보기 — 글 상자 id를 이름표(slot)로 바꿔 고르기·끌어 옮기기에 쓴다 */
function specSample(spec: PageSpec, look: { accent: string; handle: string }): Slide {
  const sl = samplePage(spec, look);
  return { ...sl, blocks: sl.blocks.map((b) => ({ ...b, id: b.slot ?? b.id })) };
}

/** 왼쪽 위 하트 (즐겨찾기) */
function Heart({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`fav-btn${on ? " on" : ""}`}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-pressed={on}
      aria-label={on ? "즐겨찾기 빼기" : "즐겨찾기"}
      title={on ? "즐겨찾기 빼기" : "즐겨찾기"}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s-7.5-4.6-9.6-9.2C1 8.7 3 5 6.6 5c2.1 0 3.6 1.2 5.4 3.1C13.8 6.2 15.3 5 17.4 5 21 5 23 8.7 21.6 11.8 19.5 16.4 12 21 12 21Z" />
      </svg>
    </button>
  );
}

type Side = "cover" | "body";
const SIDE_LABEL: Record<Side, string> = { cover: "썸네일 (1번 장)", body: "내지 (2번 장부터)" };

/** 미리보기에 쓰는 역할별 보기글 */
const SAMPLE_TEXT: Record<TextRole, string> = {
  title: "자꾸 생각나는\n떡볶이 맛집",
  subtitle: "요즘 가장 핫한 그곳",
  body: "매콤달콤한 양념에\n쫄깃한 떡이 가득",
  label: "EDITOR'S PICK",
  number: "01",
  source: "출처: 카드뉴스 연구소",
  handle: "@my_account",
  other: "기타 글",
};

/** 템플릿으로 보기 슬라이드 만들기: 표지는 본문 빼고, 내지는 제목 빼고 템플릿에 있는 역할을 모두 보여 준다 */
function sampleSlide(t: Template, side: Side): Slide {
  const blocks: TextBlock[] = ROLES.filter((r) => t.styles[r] && (side === "cover" ? r !== "body" : r !== "title")).map((r) => ({
    ...(t.styles[r] as BlockStyle),
    id: `sample-${r}`,
    role: r,
    original: "",
    text: SAMPLE_TEXT[r],
    accent: r === "title" ? "떡볶이" : r === "body" ? "쫄깃한" : "",
  }));
  return { image: null, original: "", ratio: 1.25, bg: "#3a3a3a", blocks };
}

/** 캡션 CTA 미리보기에 쓰는 보기글 (AI가 쓰는 본문 자리) */
const SAMPLE_CAPTION_BODY =
  "맛집에서 먹던 그 떡볶이, 집에서도 그대로 만들 수 있어요😳 " +
  "양념장에 비법 소스 한 스푼만 더하면 감칠맛이 확 살아나요✨ " +
  "며칠 내내 먹어도 안 질려서 하나쯤 알아두면 정말 유용해요💗";

/** DM 미리보기에 쓰는 보기 레시피 (AI가 쓰는 자리) */
const SAMPLE_DM: DmContent = {
  title: "🌶️ 즉석 떡볶이 비법 양념장",
  ingredients: ["🍯 물엿 5T", "🍚 설탕 2T", "🌶️ 고운 고춧가루 2T", "🥄 고추장 2T", "✨ 비밀재료 2T", "🧂 후추 약간"],
  steps: [
    "모든 양념 재료를 넣고 골고루 섞어주세요.",
    "냄비에 떡과 물을 넣고 양념장을 풀어주세요.",
    "떡이 부드러워지고 양념이 걸쭉해질 때까지 끓이면 완성!",
  ],
  tip: "비밀재료를 꼭 넣어야 감칠맛이 터지고 까만 양념장이 완성돼요!",
};


type Props = {
  /** 편집기 위에 겹쳐 띄운 경우 — 닫기 버튼과 '쓰고 닫기'를 보여 준다 */
  onClose?: () => void;
  /** 템플릿을 고르거나 저장했을 때 알림 (편집기 쪽 목록 갱신용) */
  onPick?: (id: string) => void;
};

export default function TemplateManager({ onClose, onPick }: Props) {
  const [templates, setTemplates] = useState<Template[]>(BUILTIN_TEMPLATES);
  const [activeId, setActiveId] = useState(DEFAULT_TEMPLATE.id);
  const [draft, setDraft] = useState<Template | null>(null);
  const [side, setSide] = useState<Side>("cover");
  const [role, setRole] = useState<TextRole>("title");
  const [askDelete, setAskDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fav, setFav] = useState<Set<string>>(new Set());
  const [favOnly, setFavOnly] = useState(false);
  // 조합 만들기: 지금 고르는 장(썸네일·내지·마지막 장)과 고르는 글 상자
  const [step, setStep] = useState<LayoutKind>("cover");
  const [slot, setSlot] = useState<string | null>(null);

  useEffect(() => {
    setTemplates(allTemplates());
    setActiveId(loadActiveId());
    setFav(loadFavorites());
  }, []);

  // 목록·편집 중인 템플릿이 쓰는 글꼴을 미리 내려받아 미리보기가 제대로 보이게
  const shown = useMemo(() => (draft ? [draft] : templates), [draft, templates]);
  useEffect(() => {
    loadFonts([...shown.flatMap(templateFontIds), ...MAG_FONTS]);
  }, [shown]);

  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2500);
  };

  const toggleFav = (id: string) =>
    setFav((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavorites(next);
      return next;
    });

  const persist = (list: Template[]) => {
    setTemplates(list);
    saveUserTemplates(list);
  };

  const use = (id: string) => {
    setActiveId(id);
    saveActiveId(id);
    onPick?.(id);
    say("이 템플릿으로 만들어요.");
  };

  const open = (t: Template) => {
    setDraft(t);
    setSide("cover");
    setRole("title");
    setStep("cover");
    setSlot(null);
  };
  /** 내 템플릿 만들기 = 썸네일·내지·마지막 장 조합 */
  const create = () => open({ ...duplicateTemplate(BUILTIN_TEMPLATES[1] ?? DEFAULT_TEMPLATE, uniqueName(templates, "내 템플릿")), combo: structuredClone(DEFAULT_COMBO) });
  const copy = (base: Template) => open(duplicateTemplate(base, uniqueName(templates, `내 ${base.name}`)));
  const edit = (t: Template) => open(structuredClone(t));

  const save = () => {
    if (!draft) return;
    const name = draft.name.trim() || "내 템플릿";
    const saved: Template = { ...draft, name, builtin: false };
    const users = templates.filter((t) => !t.builtin);
    const next = users.some((t) => t.id === saved.id)
      ? users.map((t) => (t.id === saved.id ? saved : t))
      : [saved, ...users];
    persist([...BUILTIN_TEMPLATES, ...next]);
    setDraft(null);
    use(saved.id);
  };

  const remove = (id: string) => {
    persist(templates.filter((t) => t.id !== id));
    setAskDelete(null);
    if (activeId === id) use(DEFAULT_TEMPLATE.id);
    say("템플릿을 지웠어요.");
  };

  const patch = (r: TextRole, p: Partial<BlockStyle>) =>
    setDraft((d) => (d && d.styles[r] ? { ...d, styles: { ...d.styles, [r]: { ...d.styles[r]!, ...p } } } : d));
  const addRole = (r: TextRole) =>
    setDraft((d) => {
      if (!d) return d;
      const st: BlockStyle = { ...d.styles.title, size: r === "subtitle" ? 44 : 32, y: 8, h: 8, vAlign: "top", box: false };
      return { ...d, styles: { ...d.styles, [r]: st } };
    });
  const removeRole = (r: TextRole) =>
    setDraft((d) => {
      if (!d || r === "title" || r === "body") return d;
      const styles = { ...d.styles };
      delete styles[r];
      return { ...d, styles };
    });
  const patchWm = (p: Partial<WatermarkStyle>) =>
    setDraft((d) => (d ? { ...d, watermark: { ...d.watermark, ...p } } : d));
  const patchCaption = (p: Partial<CaptionStyle>) =>
    setDraft((d) => (d ? { ...d, caption: { ...d.caption, ...p } } : d));
  const patchDm = (p: Partial<DmStyle>) =>
    setDraft((d) => (d ? { ...d, dm: { ...d.dm, ...p } } : d));

  // ── 조합 고치기 도구 ──
  const patchCombo = (p: Partial<Combo>) =>
    setDraft((d) => (d?.combo ? { ...d, combo: { ...d.combo, ...p } } : d));
  /** 지금 단계의 장을 고친다 (마지막 장 없음이면 아무것도 안 함) */
  const patchSpec = (p: Partial<PageSpec>) =>
    setDraft((d) => {
      if (!d?.combo) return d;
      const cur = d.combo[step];
      if (!cur) return d;
      return { ...d, combo: { ...d.combo, [step]: { ...cur, ...p } } };
    });
  const patchSlot = (key: string, p: Partial<BlockStyle>) =>
    setDraft((d) => {
      const cur = d?.combo?.[step];
      if (!d?.combo || !cur) return d;
      return { ...d, combo: { ...d.combo, [step]: { ...cur, styles: { ...cur.styles, [key]: { ...cur.styles?.[key], ...p } } } } };
    });
  const pickLayout = (layout: string | null) => {
    setSlot(null);
    if (!draft?.combo) return;
    if (step === "last" && !layout) return patchCombo({ last: null });
    if (layout) patchCombo({ [step]: { layout } } as Partial<Combo>);
  };

  // ── 조합(내 템플릿) 만들기·고치기 화면 ─────────────────────
  if (draft?.combo) {
    const combo = draft.combo;
    const look = lookOf(draft);
    const spec = combo[step];
    const def = spec ? getLayout(spec.layout) : undefined;
    const sample = spec ? specSample(spec, look) : null;
    const blocks = sample ? sample.blocks.filter((b) => b.text.trim()) : [];
    const cur = blocks.find((b) => b.id === slot) ?? null;
    const lastFields: Fields = (combo.last && (combo.last.fields ?? getLayout(combo.last.layout)?.sample)) || {};
    return (
      <div>
        <h1>{templates.some((t) => t.id === draft.id) ? "내 템플릿 고치기" : "내 템플릿 만들기"}</h1>
        <p className="lead">썸네일 · 내지 · 마지막 장을 하나씩 고르고 마음대로 고쳐서 나만의 조합을 만드세요.</p>

        {/* 세 장 한눈에 — 누르면 그 단계로 */}
        <div className="combo-strip">
          {KINDS.map((k) => {
            const sp = combo[k];
            return (
              <button key={k} className={`combo-step${step === k ? " on" : ""}`} onClick={() => { setStep(k); setSlot(null); }}>
                <span className="combo-step-label">{STEP_LABEL[k]}</span>
                {sp ? (
                  <SlidePreview slide={samplePage(sp, look)} watermark={draft.watermark} adLabel={false} />
                ) : (
                  <div className="layout-auto">마지막 장<br />없음</div>
                )}
                <span className="combo-step-name">{sp ? getLayout(sp.layout)?.name : "붙이지 않음"}</span>
              </button>
            );
          })}
        </div>
        <p className="muted small" style={{ margin: "8px 0 24px" }}>
          만들면 <b>1번 장은 썸네일</b>, <b>나머지 장은 모두 내지</b>로 나오고(AI가 칸에 맞게 글을 나눠요), 맨 끝에 <b>마지막 장</b>이 적어 둔 글 그대로 붙어요.
        </p>

        <div className="split">
          <div className="sticky">
            <section className="card">
              {sample ? (
                <SlidePreview
                  slide={sample}
                  watermark={draft.watermark}
                  adLabel={false}
                  selectedId={slot}
                  onSelect={(id) => setSlot(id)}
                  onMoveBlock={(id, p) => patchSlot(id, p)}
                />
              ) : (
                <div className="layout-auto" style={{ aspectRatio: "4 / 5" }}>마지막 장을<br />붙이지 않아요</div>
              )}
            </section>
          </div>

          <div>
            <section className="card stack">
              <div>
                <label className="field-label" htmlFor="tpl-name">템플릿 이름</label>
                <input id="tpl-name" type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoComplete="off" />
              </div>
              <ColorField label="포인트 색 (세 장 공통: 띠·번호·강조)" value={combo.accent} presets={ACCENTS} onChange={(accent) => patchCombo({ accent })} />
            </section>

            <section className="card stack">
              <div className="seg seg-big" role="tablist" aria-label="고를 장">
                {KINDS.map((k) => (
                  <button key={k} role="tab" aria-selected={step === k} className={step === k ? "on" : ""} onClick={() => { setStep(k); setSlot(null); }}>
                    {STEP_LABEL[k]}
                  </button>
                ))}
              </div>
              <h2 style={{ margin: 0 }}>{KIND_LABEL[step]} 고르기</h2>
              <div className="layout-grid">
                {step === "last" && (
                  <button className={`layout-pick${!combo.last ? " on" : ""}`} onClick={() => pickLayout(null)}>
                    <div className="layout-auto">마지막 장<br />없음</div>
                    <b>마지막 장 없음</b>
                    <span>마지막 장을 붙이지 않아요</span>
                  </button>
                )}
                {favFirst(layoutsOf(step), fav).map((l) => (
                  <div key={l.id} className={`layout-pick${spec?.layout === l.id ? " on" : ""}`} role="button" tabIndex={0}
                    onClick={() => pickLayout(l.id)} onKeyDown={(e) => e.key === "Enter" && pickLayout(l.id)}>
                    <Heart on={fav.has(l.id)} onClick={() => toggleFav(l.id)} />
                    <SlidePreview slide={samplePage(spec?.layout === l.id ? spec : { layout: l.id }, look)} watermark={draft.watermark} adLabel={false} />
                    <b>{l.name}</b>
                    <span>{l.desc}</span>
                  </div>
                ))}
              </div>
            </section>

            {spec && (
              <section className="card stack">
                <h2 style={{ margin: 0 }}>{KIND_LABEL[step]} 고치기</h2>
                <ColorField label="바탕색" value={spec.bg || ""} presets={BG_COLORS} onChange={(bg) => patchSpec({ bg })} />
                {step === "last" && def && (
                  <div className="stack">
                    <span className="field-label">마지막 장에 늘 들어갈 글 (AI가 바꾸지 않아요)</span>
                    {def.fields.map((f) =>
                      f.count ? (
                        Array.from({ length: f.count }, (_, i) => (
                          <input
                            key={`${f.key}.${i}`}
                            type="text"
                            value={((lastFields[f.key] as string[]) ?? [])[i] ?? ""}
                            onChange={(e) => {
                              const arr = [...(((lastFields[f.key] as string[]) ?? []))];
                              arr[i] = e.target.value;
                              patchSpec({ fields: { ...lastFields, [f.key]: arr } });
                            }}
                            aria-label={`${f.desc} ${i + 1}`}
                          />
                        ))
                      ) : (
                        <textarea
                          key={f.key}
                          rows={Math.max(2, String(lastFields[f.key] ?? "").split("\n").length)}
                          value={String(lastFields[f.key] ?? "")}
                          onChange={(e) => patchSpec({ fields: { ...lastFields, [f.key]: e.target.value } })}
                          aria-label={f.desc}
                        />
                      ),
                    )}
                    <p className="muted small" style={{ margin: 0 }}>계정 이름 자리에는 워터마크 문구(내 채널 이름)가 들어가요.</p>
                  </div>
                )}
                <span className="field-label">글 상자 모양 (미리보기에서 눌러도 돼요)</span>
                <div className="slot-list">
                  {blocks.map((b) => (
                    <button key={b.id} className={`slot-chip${slot === b.id ? " on" : ""}`} onClick={() => setSlot(b.id)}>
                      {b.text.split("\n")[0].slice(0, 16)}
                    </button>
                  ))}
                </div>
                {cur && (
                  <>
                    <StylePanel style={cur} sample={cur.text.split("\n")[0]} onChange={(p) => patchSlot(cur.id, p)} />
                    {spec.styles?.[cur.id] && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          const styles = { ...spec.styles };
                          delete styles[cur.id];
                          patchSpec({ styles });
                        }}
                      >
                        이 글 상자만 처음 모양으로
                      </button>
                    )}
                  </>
                )}
                {(spec.bg || spec.styles) && (
                  <button className="btn btn-secondary" onClick={() => patchSpec({ bg: undefined, styles: undefined })}>
                    이 장 전체를 처음 모양으로
                  </button>
                )}
              </section>
            )}

        <section className="card stack">
          <h2 style={{ margin: 0 }}>워터마크 (모든 장 공통)</h2>
          <div>
            <label className="field-label" htmlFor="wm-text">문구</label>
            <input
              id="wm-text"
              type="text"
              value={draft.watermark.text}
              onChange={(e) => patchWm({ text: e.target.value })}
              placeholder="예) 맛집도둑 (비우면 워터마크 없음)"
              autoComplete="off"
            />
          </div>
          <div>
            <span className="field-label">글꼴</span>
            <FontPicker value={draft.watermark.fontId} onChange={(fontId) => patchWm({ fontId })} sample={draft.watermark.text} />
          </div>
          <Range label="크기" value={draft.watermark.size} min={14} max={80} unit="px" onChange={(size) => patchWm({ size })} />
          <ColorField label="글자색" value={draft.watermark.color} presets={TEXT_COLORS} onChange={(v) => patchWm({ color: v })} />
          <div>
            <label className="field-label" htmlFor="wm-op">
              진하기 <span className="muted small">{draft.watermark.opacity}%</span>
            </label>
            <input
              id="wm-op"
              type="range"
              min={10}
              max={100}
              value={draft.watermark.opacity}
              onChange={(e) => patchWm({ opacity: Number(e.target.value) })}
            />
          </div>
          <Seg<WatermarkStyle["pos"]>
            label="위치"
            value={draft.watermark.pos}
            options={["bottom", "bottom-left", "top-left"]}
            labels={WATERMARK_POS_LABEL}
            onChange={(v) => patchWm({ pos: v })}
          />
          <Toggle
            label="오른쪽 위 [광고] 표시"
            hint="쿠팡 파트너스·협찬 게시물은 꼭 켜 두세요"
            checked={draft.adLabel}
            onChange={(adLabel) => setDraft({ ...draft, adLabel })}
          />
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>캡션 CTA (댓글 유도 문구)</h2>
          <p className="muted small" style={{ margin: 0 }}>
            인스타 본문 글의 <b>맨 윗줄</b>과 <b>맨 아랫줄</b>에 항상 들어가는 문구예요.
            가운데 본문은 AI가 사진에 맞게 새로 써 줘요.
          </p>

          <div>
            <label className="field-label" htmlFor="cta-top">맨 윗줄</label>
            <input
              id="cta-top"
              type="text"
              value={draft.caption.topCta}
              onChange={(e) => patchCaption({ topCta: e.target.value })}
              placeholder="예) 🤤 댓글에 '나도' 남겨주세요! (비우면 안 들어감)"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="cta-bottom">맨 아랫줄</label>
            <input
              id="cta-bottom"
              type="text"
              value={draft.caption.bottomCta}
              onChange={(e) => patchCaption({ bottomCta: e.target.value })}
              placeholder="예) 💬 레시피 궁금하면 댓글 남겨주세요! 👉 (비우면 안 들어감)"
              autoComplete="off"
            />
          </div>

          <div>
            <span className="field-label">이렇게 올라가요</span>
            <div className="caption-preview">{buildCaption(SAMPLE_CAPTION_BODY, draft)}</div>
          </div>
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>고정 댓글</h2>
          <p className="muted small" style={{ margin: 0 }}>
            게시물에 올리고 맨 위에 고정해 둘 댓글이에요. 적어 둔 그대로 나와요.
          </p>
          <textarea
            id="pinned-comment"
            rows={4}
            value={draft.pinnedComment}
            onChange={(e) => setDraft({ ...draft, pinnedComment: e.target.value })}
            aria-label="고정 댓글"
          />
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>자동 DM (댓글 단 사람에게 보내는 글)</h2>
          <p className="muted small" style={{ margin: 0 }}>
            <b>맨 아랫줄(버튼 안내)</b>만 정하면 돼요. 첫 줄 <b>&quot;댓글로 요청하신 레시피 드립니다!&quot;</b>는 항상 들어가고,
            가운데 레시피는 AI가 사진을 보고 써 줘요. <b>비밀재료는 이름을 밝히지 않아요.</b>
          </p>

          <div>
            <label className="field-label" htmlFor="dm-cta">맨 아랫줄 (버튼 안내)</label>
            <textarea
              id="dm-cta"
              rows={3}
              value={draft.dm.bottomCta}
              onChange={(e) => patchDm({ bottomCta: e.target.value })}
              placeholder={"예) 👇비밀 재료는 하단 버튼 클릭 후\n<1 or 재료> 검색해주세요!"}
            />
          </div>

          <div>
            <span className="field-label">이렇게 보내져요</span>
            <div className="caption-preview">{buildDm(SAMPLE_DM, draft)}</div>
          </div>
        </section>

        <div className="row">
          <button className="btn btn-secondary" onClick={() => setDraft(null)}>취소</button>
          <button className="btn btn-primary" onClick={save}>💾 저장하고 이 템플릿 쓰기</button>
        </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 글 상자형(기본 디자인) 고치기 화면 ─────────────────────
  if (draft) {
    const st = draft.styles[role] ?? draft.styles.title;
    const sample = sampleSlide(draft, side);
    const roles = ROLES.filter((r) => draft.styles[r]);
    const missing = ROLES.filter((r) => !draft.styles[r]);
    return (
      <div>
        <h1>템플릿 고치기</h1>
        <p className="lead">역할(제목·본문…)을 고르고 오른쪽에서 바꾸면 왼쪽 미리보기에 바로 나타나요. 미리보기에서 글을 끌어 옮길 수도 있어요.</p>

        <div className="split">
          <div className="sticky">
            <div className="seg seg-big" role="tablist" aria-label="썸네일과 내지 고르기">
              {(["cover", "body"] as Side[]).map((sd) => (
                <button key={sd} role="tab" aria-selected={side === sd} className={side === sd ? "on" : ""} onClick={() => setSide(sd)}>
                  {SIDE_LABEL[sd]}
                </button>
              ))}
            </div>
            <section className="card">
              <SlidePreview
                slide={sample}
                watermark={draft.watermark}
                adLabel={draft.adLabel}
                selectedId={`sample-${role}`}
                onSelect={(id) => id && setRole(id.replace("sample-", "") as TextRole)}
                onMoveBlock={(id, p) => patch(id.replace("sample-", "") as TextRole, p)}
              />
            </section>
          </div>
          <div>
        <section className="card stack">
          <div>
            <label className="field-label" htmlFor="tpl-name">템플릿 이름</label>
            <input id="tpl-name" type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoComplete="off" />
          </div>
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>글 모양 (역할별)</h2>
          <div className="seg seg-wrap" role="tablist" aria-label="역할 고르기">
            {roles.map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={role === r}
                className={role === r ? "on" : ""}
                onClick={() => {
                  setRole(r);
                  if (r === "title") setSide("cover");
                  if (r === "body") setSide("body");
                }}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          {missing.length > 0 && (
            <div className="row">
              <select value="" onChange={(e) => { const r = e.target.value as TextRole; if (r) { addRole(r); setRole(r); } }} aria-label="역할 추가">
                <option value="">➕ 다른 역할 모양도 정하기…</option>
                {missing.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
              {role !== "title" && role !== "body" && (
                <button className="btn btn-secondary" onClick={() => { removeRole(role); setRole("title"); }}>이 역할 빼기</button>
              )}
            </div>
          )}
          <p className="muted small" style={{ margin: 0 }}>
            썸네일(1번 장)에는 <b>제목</b>, 2번 장부터는 <b>본문</b> 모양이 입혀져요. 글 상자를 직접 추가하면 다른 역할도 쓸 수 있어요.
          </p>
          <StylePanel style={st} sample={SAMPLE_TEXT[role].split("\n")[0]} onChange={(p) => patch(role, p)} />
        </section>
        <section className="card stack">
          <h2 style={{ margin: 0 }}>워터마크 (모든 장 공통)</h2>
          <div>
            <label className="field-label" htmlFor="wm-text">문구</label>
            <input
              id="wm-text"
              type="text"
              value={draft.watermark.text}
              onChange={(e) => patchWm({ text: e.target.value })}
              placeholder="예) 맛집도둑 (비우면 워터마크 없음)"
              autoComplete="off"
            />
          </div>
          <div>
            <span className="field-label">글꼴</span>
            <FontPicker value={draft.watermark.fontId} onChange={(fontId) => patchWm({ fontId })} sample={draft.watermark.text} />
          </div>
          <Range label="크기" value={draft.watermark.size} min={14} max={80} unit="px" onChange={(size) => patchWm({ size })} />
          <ColorField label="글자색" value={draft.watermark.color} presets={TEXT_COLORS} onChange={(v) => patchWm({ color: v })} />
          <div>
            <label className="field-label" htmlFor="wm-op">
              진하기 <span className="muted small">{draft.watermark.opacity}%</span>
            </label>
            <input
              id="wm-op"
              type="range"
              min={10}
              max={100}
              value={draft.watermark.opacity}
              onChange={(e) => patchWm({ opacity: Number(e.target.value) })}
            />
          </div>
          <Seg<WatermarkStyle["pos"]>
            label="위치"
            value={draft.watermark.pos}
            options={["bottom", "bottom-left", "top-left"]}
            labels={WATERMARK_POS_LABEL}
            onChange={(v) => patchWm({ pos: v })}
          />
          <Toggle
            label="오른쪽 위 [광고] 표시"
            hint="쿠팡 파트너스·협찬 게시물은 꼭 켜 두세요"
            checked={draft.adLabel}
            onChange={(adLabel) => setDraft({ ...draft, adLabel })}
          />
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>캡션 CTA (댓글 유도 문구)</h2>
          <p className="muted small" style={{ margin: 0 }}>
            인스타 본문 글의 <b>맨 윗줄</b>과 <b>맨 아랫줄</b>에 항상 들어가는 문구예요.
            가운데 본문은 AI가 사진에 맞게 새로 써 줘요.
          </p>

          <div>
            <label className="field-label" htmlFor="cta-top">맨 윗줄</label>
            <input
              id="cta-top"
              type="text"
              value={draft.caption.topCta}
              onChange={(e) => patchCaption({ topCta: e.target.value })}
              placeholder="예) 🤤 댓글에 '나도' 남겨주세요! (비우면 안 들어감)"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="cta-bottom">맨 아랫줄</label>
            <input
              id="cta-bottom"
              type="text"
              value={draft.caption.bottomCta}
              onChange={(e) => patchCaption({ bottomCta: e.target.value })}
              placeholder="예) 💬 레시피 궁금하면 댓글 남겨주세요! 👉 (비우면 안 들어감)"
              autoComplete="off"
            />
          </div>

          <div>
            <span className="field-label">이렇게 올라가요</span>
            <div className="caption-preview">{buildCaption(SAMPLE_CAPTION_BODY, draft)}</div>
          </div>
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>고정 댓글</h2>
          <p className="muted small" style={{ margin: 0 }}>
            게시물에 올리고 맨 위에 고정해 둘 댓글이에요. 적어 둔 그대로 나와요.
          </p>
          <textarea
            id="pinned-comment"
            rows={4}
            value={draft.pinnedComment}
            onChange={(e) => setDraft({ ...draft, pinnedComment: e.target.value })}
            aria-label="고정 댓글"
          />
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>자동 DM (댓글 단 사람에게 보내는 글)</h2>
          <p className="muted small" style={{ margin: 0 }}>
            <b>맨 아랫줄(버튼 안내)</b>만 정하면 돼요. 첫 줄 <b>&quot;댓글로 요청하신 레시피 드립니다!&quot;</b>는 항상 들어가고,
            가운데 레시피는 AI가 사진을 보고 써 줘요. <b>비밀재료는 이름을 밝히지 않아요.</b>
          </p>

          <div>
            <label className="field-label" htmlFor="dm-cta">맨 아랫줄 (버튼 안내)</label>
            <textarea
              id="dm-cta"
              rows={3}
              value={draft.dm.bottomCta}
              onChange={(e) => patchDm({ bottomCta: e.target.value })}
              placeholder={"예) 👇비밀 재료는 하단 버튼 클릭 후\n<1 or 재료> 검색해주세요!"}
            />
          </div>

          <div>
            <span className="field-label">이렇게 보내져요</span>
            <div className="caption-preview">{buildDm(SAMPLE_DM, draft)}</div>
          </div>
        </section>

        <div className="row">
          <button className="btn btn-secondary" onClick={() => setDraft(null)}>취소</button>
          <button className="btn btn-primary" onClick={save}>💾 저장하고 이 템플릿 쓰기</button>
        </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 목록 화면 ───────────────────────────────────────────────
  const card = (t: Template) => (
    <section className={`card tpl-card${activeId === t.id ? " on" : ""}`} key={t.id}>
      <Heart on={fav.has(t.id)} onClick={() => toggleFav(t.id)} />
      <div className="tpl-head">
        <h2 style={{ margin: 0 }}>{t.name}</h2>
        {activeId === t.id && <span className="badge">지금 쓰는 중</span>}
      </div>
      {t.combo ? (
        <div className="tpl-shots tpl-shots-3">
          {KINDS.map((k) => {
            const sp = t.combo![k];
            return (
              <figure key={k}>
                {sp ? <SlidePreview slide={samplePage(sp, lookOf(t))} watermark={t.watermark} adLabel={false} /> : <div className="layout-auto">없음</div>}
                <figcaption>{KIND_LABEL[k]}</figcaption>
              </figure>
            );
          })}
        </div>
      ) : (
        <div className="tpl-shots">
          <SlidePreview slide={sampleSlide(t, "cover")} watermark={t.watermark} adLabel={t.adLabel} />
          <SlidePreview slide={sampleSlide(t, "body")} watermark={t.watermark} adLabel={t.adLabel} />
        </div>
      )}
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn btn-primary" onClick={() => use(t.id)} disabled={activeId === t.id}>
          {activeId === t.id ? "✓ 쓰는 중" : "이 템플릿 쓰기"}
        </button>
        {t.builtin ? (
          <button className="btn btn-secondary" onClick={() => copy(t)}>복제해서 고치기</button>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={() => edit(t)}>✎ 고치기</button>
            <button className="btn btn-secondary" onClick={() => copy(t)}>복제</button>
            <button className="btn btn-secondary" onClick={() => setAskDelete(t.id)}>지우기</button>
          </>
        )}
      </div>
      {askDelete === t.id && (
        <div className="notice notice-error" style={{ marginTop: 16, marginBottom: 0 }}>
          <p style={{ margin: "0 0 12px" }}><b>{t.name}</b> 템플릿을 지울까요?</p>
          <div className="row">
            <button className="btn btn-secondary" onClick={() => setAskDelete(null)}>아니요</button>
            <button className="btn btn-primary" onClick={() => remove(t.id)}>네, 지울래요</button>
          </div>
        </div>
      )}
    </section>
  );

  const keep = (list: Template[]) => favFirst(favOnly ? list.filter((x) => fav.has(x.id)) : list, fav);
  const mine = keep(templates.filter((t) => !t.builtin));
  const base = keep(templates.filter((t) => t.builtin));

  return (
    <div>
      <h1>디자인 템플릿</h1>
      <p className="lead">썸네일 · 내지 · 마지막 장을 골라 나만의 템플릿을 만들고, 클릭 한 번으로 전 장을 만들어 보세요.</p>

      {toast && <div className="notice notice-info" role="status">{toast}</div>}

      <div className="tpl-toolbar">
        <button className={`fav-filter${favOnly ? " on" : ""}`} onClick={() => setFavOnly(!favOnly)} aria-pressed={favOnly}>
          ♥ 즐겨찾기만 보기
        </button>
        <button className="btn btn-primary" onClick={create}>➕ 내 템플릿 만들기</button>
      </div>

      <h2 className="tpl-section">내 템플릿 <span className="muted small">{mine.length}개</span></h2>
      {mine.length ? (
        <div className="tpl-grid">{mine.map(card)}</div>
      ) : (
        <div className="card empty-mine">
          {favOnly ? "즐겨찾기한 내 템플릿이 없어요." : "아직 내 템플릿이 없어요. '내 템플릿 만들기'를 눌러 썸네일 · 내지 · 마지막 장을 골라 보세요."}
        </div>
      )}

      <h2 className="tpl-section">기본 제공</h2>
      {base.length ? (
        <div className="tpl-grid">{base.map(card)}</div>
      ) : (
        <div className="card empty-mine">즐겨찾기한 기본 제공 템플릿이 없어요. 카드 왼쪽 위 하트를 눌러 보세요.</div>
      )}

      {onClose && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button className="link-btn" onClick={onClose}>← 편집 화면으로 돌아가기</button>
        </div>
      )}
    </div>
  );
}
