"use client";

import { useEffect, useMemo, useState } from "react";
import { SlidePreview } from "./SlideCard";
import { buildCaption } from "@/lib/caption";
import { buildDm, type DmContent } from "@/lib/dm";
import { FONTS, loadFonts } from "@/lib/webfonts";
import {
  ALIGN_LABEL,
  BUILTIN_TEMPLATES,
  DEFAULT_TEMPLATE,
  SIZE_LABEL,
  VPOS_LABEL,
  WATERMARK_POS_LABEL,
  allTemplates,
  duplicateTemplate,
  loadActiveId,
  saveActiveId,
  saveUserTemplates,
  templateFontIds,
  uniqueName,
  type Align,
  type CaptionStyle,
  type DmStyle,
  type Template,
  type TextSize,
  type TextStyle,
  type VPos,
  type WatermarkStyle,
} from "@/lib/templates";
import type { Slide } from "@/lib/types";

/** 미리보기에 쓰는 보기글 */
const SAMPLE: Record<Side, Slide> = {
  cover: { image: null, original: "", title: "자꾸 생각나는\n떡볶이 맛집", body: "" },
  body: { image: null, original: "", title: "", body: "매콤달콤한 양념에\n쫄깃한 떡이 가득" },
};

type Side = "cover" | "body";
const SIDE_LABEL: Record<Side, string> = { cover: "표지 (1번 장)", body: "내지 (2번 장부터)" };

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

const TEXT_COLORS = ["#ffffff", "#1c1c1e", "#ffe14d", "#ff5a3c", "#2f6bff", "#1b7f3a"];
const BOX_COLORS = ["#ffffff", "#000000", "#1c1c1e", "#ffe14d", "#2f6bff", "#c62828"];

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
  const [askDelete, setAskDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setTemplates(allTemplates());
    setActiveId(loadActiveId());
  }, []);

  // 목록·편집 중인 템플릿이 쓰는 글꼴을 미리 내려받아 미리보기가 제대로 보이게
  const shown = useMemo(() => (draft ? [draft] : templates), [draft, templates]);
  useEffect(() => {
    loadFonts(shown.flatMap(templateFontIds));
  }, [shown]);

  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2500);
  };

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

  const create = () => {
    const t = duplicateTemplate(DEFAULT_TEMPLATE, uniqueName(templates, "내 디자인"));
    setDraft(t);
    setSide("cover");
  };

  const copy = (base: Template) => {
    const t = duplicateTemplate(base, uniqueName(templates, `${base.name} 복사본`));
    setDraft(t);
    setSide("cover");
  };

  const edit = (t: Template) => {
    setDraft(structuredClone(t));
    setSide("cover");
  };

  const save = () => {
    if (!draft) return;
    const name = draft.name.trim() || "내 디자인";
    const saved: Template = { ...draft, name, builtin: false };
    const users = templates.filter((t) => !t.builtin);
    const next = users.some((t) => t.id === saved.id)
      ? users.map((t) => (t.id === saved.id ? saved : t))
      : [...users, saved];
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

  const patch = (s: Side, p: Partial<TextStyle>) =>
    setDraft((d) => (d ? { ...d, [s]: { ...d[s], ...p } } : d));
  const patchWm = (p: Partial<WatermarkStyle>) =>
    setDraft((d) => (d ? { ...d, watermark: { ...d.watermark, ...p } } : d));
  const patchCaption = (p: Partial<CaptionStyle>) =>
    setDraft((d) => (d ? { ...d, caption: { ...d.caption, ...p } } : d));
  const patchDm = (p: Partial<DmStyle>) =>
    setDraft((d) => (d ? { ...d, dm: { ...d.dm, ...p } } : d));

  // ── 편집 화면 ───────────────────────────────────────────────
  if (draft) {
    const st = draft[side];
    return (
      <div>
        <h1>템플릿 고치기</h1>
        <p className="lead">오른쪽에서 바꾸면 왼쪽 미리보기에 바로 나타나요.</p>

        <div className="split">
          {/* 왼쪽: 바뀌는 걸 바로 보는 미리보기 (PC는 화면에 고정, 모바일은 위에 붙음) */}
          <div className="sticky">
            <div className="seg seg-big" role="tablist" aria-label="표지와 내지 고르기">
              {(["cover", "body"] as Side[]).map((s) => (
                <button key={s} role="tab" aria-selected={side === s} className={side === s ? "on" : ""} onClick={() => setSide(s)}>
                  {SIDE_LABEL[s]}
                </button>
              ))}
            </div>
            <section className="card">
              <SlidePreview
                slide={SAMPLE[side]}
                index={side === "cover" ? 0 : 1}
                watermark={draft.watermark.text}
                template={draft}
              />
            </section>
          </div>

          {/* 오른쪽: 설정 */}
          <div>
        <section className="card stack">
          <div>
            <label className="field-label" htmlFor="tpl-name">템플릿 이름</label>
            <input
              id="tpl-name"
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              autoComplete="off"
            />
          </div>
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>{SIDE_LABEL[side]} 글자</h2>

          <div>
            <label className="field-label" htmlFor={`font-${side}`}>글꼴</label>
            <select id={`font-${side}`} value={st.fontId} onChange={(e) => patch(side, { fontId: e.target.value })}>
              {FONTS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>

          <Seg<TextSize>
            label="글자 크기"
            value={st.size}
            options={["small", "normal", "large"]}
            labels={SIZE_LABEL}
            onChange={(v) => patch(side, { size: v })}
          />

          <ColorField
            label="글자색"
            value={st.color}
            presets={TEXT_COLORS}
            onChange={(v) => patch(side, { color: v })}
          />

          <Toggle
            label="글자 테두리"
            hint="사진 위에서도 글씨가 또렷하게 보여요"
            checked={st.outline}
            onChange={(v) => patch(side, { outline: v })}
          />

          <Seg<VPos>
            label="글 위치"
            value={st.pos}
            options={["top", "middle", "bottom"]}
            labels={VPOS_LABEL}
            onChange={(v) => patch(side, { pos: v })}
          />

          <Seg<Align>
            label="글 정렬"
            value={st.align}
            options={["left", "center", "right"]}
            labels={ALIGN_LABEL}
            onChange={(v) => patch(side, { align: v })}
          />
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>{SIDE_LABEL[side]} 글상자</h2>
          <Toggle
            label="글상자 쓰기"
            hint="글 뒤에 네모난 바탕을 깔아요"
            checked={st.box}
            onChange={(v) => patch(side, { box: v })}
          />
          {st.box && (
            <>
              <ColorField
                label="글상자 색"
                value={st.boxColor}
                presets={BOX_COLORS}
                onChange={(v) => patch(side, { boxColor: v })}
              />
              <div>
                <label className="field-label" htmlFor={`op-${side}`}>
                  글상자 진하기 <span className="muted small">{st.boxOpacity}%</span>
                </label>
                <input
                  id={`op-${side}`}
                  type="range"
                  min={0}
                  max={100}
                  value={st.boxOpacity}
                  onChange={(e) => patch(side, { boxOpacity: Number(e.target.value) })}
                />
              </div>
              <Toggle label="글상자 테두리" checked={st.boxBorder} onChange={(v) => patch(side, { boxBorder: v })} />
            </>
          )}
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
            <label className="field-label" htmlFor="wm-font">글꼴</label>
            <select id="wm-font" value={draft.watermark.fontId} onChange={(e) => patchWm({ fontId: e.target.value })}>
              {FONTS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>
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
          <p className="muted small" style={{ margin: 0 }}>
            오른쪽 위 <b>[광고]</b> 표시는 쿠팡 파트너스 규정상 꼭 들어가야 해서 항상 붙어요.
          </p>
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
  return (
    <div>
      <h1>디자인 템플릿</h1>
      <p className="lead">
        표지와 내지의 글꼴·색·글상자를 미리 정해 두고, 카드뉴스를 만들 때 골라 쓰세요.
      </p>

      {toast && <div className="notice notice-info" role="status">{toast}</div>}

      <div className="tpl-grid">
        {templates.map((t) => (
          <section className={`card tpl-card${activeId === t.id ? " on" : ""}`} key={t.id}>
            <div className="tpl-head">
              <h2 style={{ margin: 0 }}>{t.name}</h2>
              {activeId === t.id && <span className="badge">지금 쓰는 중</span>}
            </div>
            <div className="tpl-shots">
              <SlidePreview slide={SAMPLE.cover} index={0} watermark={t.watermark.text} template={t} />
              <SlidePreview slide={SAMPLE.body} index={1} watermark={t.watermark.text} template={t} />
            </div>
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
        ))}
      </div>

      <button className="btn btn-primary btn-huge" onClick={create}>➕ 새 템플릿 만들기</button>

      {onClose && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button className="link-btn" onClick={onClose}>← 편집 화면으로 돌아가기</button>
        </div>
      )}
    </div>
  );
}

function Seg<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="seg">
        {options.map((o) => (
          <button key={o} className={value === o ? "on" : ""} onClick={() => onChange(o)} aria-pressed={value === o}>
            {labels[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  presets,
  onChange,
}: {
  label: string;
  value: string;
  presets: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="swatches">
        {presets.map((c) => (
          <button
            key={c}
            className={`swatch${value.toLowerCase() === c ? " on" : ""}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={c}
          />
        ))}
        <input
          type="color"
          className="swatch swatch-pick"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} 직접 고르기`}
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <b>{label}</b>
        {hint && <span className="muted small"> — {hint}</span>}
      </span>
    </label>
  );
}
