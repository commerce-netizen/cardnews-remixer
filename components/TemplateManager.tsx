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

type Side = "cover" | "body";
const SIDE_LABEL: Record<Side, string> = { cover: "표지 (1번 장)", body: "내지 (2번 장부터)" };

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
    setRole("title");
  };

  const copy = (base: Template) => {
    const t = duplicateTemplate(base, uniqueName(templates, `${base.name} 복사본`));
    setDraft(t);
    setSide("cover");
    setRole("title");
  };

  const edit = (t: Template) => {
    setDraft(structuredClone(t));
    setSide("cover");
    setRole("title");
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

  // ── 편집 화면 ───────────────────────────────────────────────
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
          {/* 왼쪽: 바뀌는 걸 바로 보는 미리보기 (PC는 화면에 고정, 모바일은 위에 붙음) */}
          <div className="sticky">
            <div className="seg seg-big" role="tablist" aria-label="표지와 내지 고르기">
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
            표지(1번 장)에는 <b>제목</b>, 2번 장부터는 <b>본문</b> 모양이 입혀져요. 글 상자를 직접 추가하면 다른 역할도 쓸 수 있어요.
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
  return (
    <div>
      <h1>디자인 템플릿</h1>
      <p className="lead">
        제목·본문 같은 역할마다 글꼴·굵기·크기·색·위치·글상자를 미리 정해 두고, 카드뉴스를 만들 때 골라 쓰세요.
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
              <SlidePreview slide={sampleSlide(t, "cover")} watermark={t.watermark} adLabel={t.adLabel} />
              <SlidePreview slide={sampleSlide(t, "body")} watermark={t.watermark} adLabel={t.adLabel} />
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
