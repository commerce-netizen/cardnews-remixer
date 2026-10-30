"use client";

import { useState } from "react";
import Editor from "@/components/Editor";
import { prepareImages, type PreparedImage } from "@/lib/client-images";
import type { ExtractResult, RemixRequest, RemixResult, Slide } from "@/lib/types";

type Step = "home" | "manual" | "loading" | "edit";

/** 다시 각색할 때 쓰는 원본 자료 */
type Source = { request: RemixRequest; images: (string | null)[] };

const proxied = (u: string) => `/api/image?url=${encodeURIComponent(u)}`;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.");
  return data as T;
}

export default function Home() {
  const [step, setStep] = useState<Step>("home");
  const [url, setUrl] = useState("");
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // 수동 입력
  const [uploads, setUploads] = useState<PreparedImage[]>([]);
  const [slideText, setSlideText] = useState("");
  const [manualCaption, setManualCaption] = useState("");

  // 결과
  const [source, setSource] = useState<Source | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [caption, setCaption] = useState("");

  const runRemix = async (src: Source, back: Step) => {
    setError(null);
    setStep("loading");
    setLoadingMsg("AI가 글을 새로 쓰고 있어요…\n30초~1분 정도 걸려요. 화면을 닫지 마세요.");
    try {
      const r = await postJson<RemixResult>("/api/remix", src.request);
      const n = Math.max(r.slides.length, src.images.length);
      setSlides(
        Array.from({ length: n }, (_, i) => {
          const title = r.slides[i]?.title?.trim() ?? "";
          const body = r.slides[i]?.body?.trim() ?? "";
          // 디자인 틀: 1번 장은 제목만, 2번 장부터는 본문만 보인다. AI가 칸을 잘못 채워도 글이 사라지지 않게 합친다.
          return {
            image: src.images[i] ?? null,
            original: r.slides[i]?.original ?? "",
            title: i === 0 ? title || body : title,
            body: i === 0 ? body : body || title,
          };
        }),
      );
      setCaption(r.caption);
      setSource(src);
      setStep("edit");
      window.scrollTo(0, 0);
    } catch (e) {
      setError((e as Error).message);
      setStep(back);
    }
  };

  const startFromUrl = async () => {
    if (!url.trim()) {
      setError("먼저 위 칸에 인스타그램 게시물 주소를 붙여 넣어 주세요.");
      return;
    }
    setError(null);
    setInfo(null);
    setStep("loading");
    setLoadingMsg("인스타그램에서 게시물을 가져오는 중이에요…");
    let extracted: ExtractResult;
    try {
      extracted = await postJson<ExtractResult>("/api/extract", { url });
    } catch (e) {
      // 자동 추출 실패 → 수동 업로드 화면으로 안내
      setInfo(`${(e as Error).message}\n괜찮아요! 아래에서 사진을 직접 올리고 글을 붙여 넣으면 똑같이 만들 수 있어요.`);
      setStep("manual");
      return;
    }
    await runRemix(
      {
        request: { imageUrls: extracted.imageUrls, caption: extracted.caption },
        images: extracted.imageUrls.map(proxied),
      },
      "home",
    );
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    try {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      const prepared = await prepareImages(list);
      setUploads((prev) => [...prev, ...prepared].slice(0, 10));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const startManual = () => {
    if (!uploads.length && !slideText.trim()) {
      setError("사진을 올리거나, 카드뉴스 글을 붙여 넣어 주세요. (둘 중 하나는 꼭 필요해요)");
      return;
    }
    runRemix(
      {
        request: {
          imageDataUrls: uploads.map((u) => u.forAi),
          slideText,
          caption: manualCaption,
        },
        images: uploads.map((u) => u.display),
      },
      "manual",
    );
  };

  const restart = () => {
    setStep("home");
    setError(null);
    setInfo(null);
    setUrl("");
    setUploads([]);
    setSlideText("");
    setManualCaption("");
    setSlides([]);
    setSource(null);
  };

  return (
    <main className="page">
      {step === "loading" && (
        <div className="loading" aria-live="polite">
          <div className="spinner" />
          <p style={{ fontSize: "1.3rem", fontWeight: 700, whiteSpace: "pre-line" }}>{loadingMsg}</p>
        </div>
      )}

      {step === "home" && (
        <>
          <h1>카드뉴스 각색기</h1>
          <p className="lead">인스타그램 카드뉴스 주소만 넣으면, 글과 디자인을 새롭게 바꿔 드려요.</p>

          {error && <div className="notice notice-error" role="alert">{error}</div>}

          <div className="card stack">
            <label className="field-label" htmlFor="url">인스타그램 게시물 주소</label>
            <input
              id="url"
              type="url"
              inputMode="url"
              placeholder="여기에 주소 붙여 넣기"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startFromUrl()}
              autoComplete="off"
            />
            <button className="btn btn-primary btn-huge" onClick={startFromUrl}>
              카드뉴스 새로 만들기 ▶
            </button>
            <p className="muted small" style={{ margin: 0 }}>
              주소 얻는 법: 인스타그램 게시물 오른쪽 위 ⋯ (또는 종이비행기) → <b>링크 복사</b>
            </p>
          </div>

          <div style={{ textAlign: "center" }}>
            <button className="link-btn" onClick={() => { setError(null); setStep("manual"); }}>
              주소로 안 되나요? 사진을 직접 올려서 만들기
            </button>
          </div>
        </>
      )}

      {step === "manual" && (
        <>
          <h1>직접 올려서 만들기</h1>
          <p className="lead">카드뉴스 사진을 올리고, 글이 있으면 붙여 넣어 주세요. 사진 속 글씨는 AI가 읽어요.</p>

          {info && <div className="notice notice-info" style={{ whiteSpace: "pre-line" }}>{info}</div>}
          {error && <div className="notice notice-error" role="alert">{error}</div>}

          <section className="card stack">
            <h2 style={{ margin: 0 }}>① 카드뉴스 사진 (최대 10장)</h2>
            <label className="btn btn-primary btn-block">
              📷 사진 고르기
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
            {uploads.length > 0 && (
              <>
                <div className="thumbs">
                  {uploads.map((u, i) => (
                    <div className="thumb" key={i}>
                      <img src={u.display} alt={`${i + 1}번째 사진`} />
                      <span>{i + 1}</span>
                    </div>
                  ))}
                </div>
                <button className="btn btn-secondary" onClick={() => setUploads([])}>사진 모두 지우기</button>
              </>
            )}
            <p className="muted small" style={{ margin: 0 }}>순서대로 골라 주세요. 고른 순서가 슬라이드 순서가 돼요.</p>
          </section>

          <section className="card stack">
            <h2 style={{ margin: 0 }}>② 카드뉴스 글 (선택)</h2>
            <textarea
              rows={6}
              placeholder={"장마다 빈 줄로 나눠 붙여 넣어 주세요.\n\n예)\n여름 필수템 3가지\n\n첫 번째, 휴대용 선풍기"}
              value={slideText}
              onChange={(e) => setSlideText(e.target.value)}
            />
            <h2 style={{ margin: "12px 0 0" }}>③ 원래 캡션 (선택)</h2>
            <textarea
              rows={4}
              placeholder="게시물 아래 본문 글이 있으면 붙여 넣어 주세요."
              value={manualCaption}
              onChange={(e) => setManualCaption(e.target.value)}
            />
          </section>

          <button className="btn btn-primary btn-huge" onClick={startManual}>
            카드뉴스 새로 만들기 ▶
          </button>
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button className="link-btn" onClick={restart}>← 주소 넣는 화면으로</button>
          </div>
        </>
      )}

      {step === "edit" && error && <div className="notice notice-error" role="alert">{error}</div>}
      {step === "edit" && source && (
        <Editor
          slides={slides}
          caption={caption}
          onChangeSlides={setSlides}
          onChangeCaption={setCaption}
          // 다시 각색해도 사용자가 바꾼 사진은 유지
          onRemixAgain={() => runRemix({ ...source, images: slides.map((s) => s.image) }, "edit")}
          onRestart={restart}
        />
      )}
    </main>
  );
}
