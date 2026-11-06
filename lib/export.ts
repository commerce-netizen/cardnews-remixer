import { getFontEmbedCSS, toBlob } from "html-to-image";
import JSZip from "jszip";
import { SLIDE_W } from "@/lib/layout";

/** 슬라이드 요소들을 실제 크기(폭 1080) PNG로 만든다. 장마다 쓰는 글꼴이 달라서 글꼴은 장마다 심는다. */
export async function renderSlides(
  nodes: HTMLElement[],
  onProgress?: (done: number) => void,
): Promise<Blob[]> {
  await document.fonts.ready;
  const blobs: Blob[] = [];
  for (const node of nodes) {
    const fontEmbedCSS = await getFontEmbedCSS(node);
    const blob = await toBlob(node, {
      width: SLIDE_W,
      height: node.offsetHeight,
      pixelRatio: 1,
      fontEmbedCSS,
      cacheBust: false,
    });
    if (!blob) throw new Error("이미지를 만들지 못했어요.");
    blobs.push(blob);
    onProgress?.(blobs.length);
  }
  return blobs;
}

export async function downloadZip(
  blobs: Blob[],
  caption: string,
  pinnedComment: string,
  dm: string,
): Promise<void> {
  const zip = new JSZip();
  blobs.forEach((b, i) => zip.file(`slide_${String(i + 1).padStart(2, "0")}.png`, b));
  zip.file("caption.txt", caption);
  if (pinnedComment.trim()) zip.file("pinned_comment.txt", pinnedComment);
  if (dm.trim()) zip.file("dm.txt", dm);
  const file = await zip.generateAsync({ type: "blob" });
  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(file, `cardnews_${stamp}.zip`);
}

export function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** 어떤 기기인지 — 휴대폰은 압축 파일 대신 사진으로 바로 저장한다 */
export function deviceKind(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  // 아이패드 OS는 맥처럼 보이므로 터치 여부로 가린다
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

const slideName = (i: number) => `slide_${String(i + 1).padStart(2, "0")}.png`;

/** 공유 창으로 넘길 수 있는지 (아이폰: '이미지 N개 저장' → 사진 앱) */
export function canShareImages(blobs: Blob[]): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  const files = blobs.map((b, i) => new File([b], slideName(i), { type: "image/png" }));
  try {
    return navigator.canShare({ files });
  } catch {
    return false;
  }
}

/**
 * 휴대폰 사진 앱(갤러리)에 넣기.
 * - 아이폰: 공유 창을 열어 '이미지 N개 저장' 한 번으로 사진 앱에 전부 저장 (버튼을 누른 그 순간에 불러야 열린다)
 * - 갤럭시 등 안드로이드: 사진을 한 장씩 내려받기 → 갤러리 'Download' 앨범에 바로 보인다
 * 돌려주는 값: "shared"(공유 창 열림) / "downloaded" / "cancelled"
 */
export async function saveToGallery(blobs: Blob[]): Promise<"shared" | "downloaded" | "cancelled"> {
  const kind = deviceKind();
  if (kind === "ios" && canShareImages(blobs)) {
    const files = blobs.map((b, i) => new File([b], slideName(i), { type: "image/png" }));
    try {
      await navigator.share({ files });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
      throw e;
    }
  }
  // 안드로이드(또는 공유가 안 되는 기기): 한 장씩 저장. 한꺼번에 받으면 브라우저가 막을 수 있어 조금씩 띄운다
  for (let i = 0; i < blobs.length; i++) {
    triggerDownload(blobs[i], slideName(i));
    await new Promise((r) => setTimeout(r, 400));
  }
  return "downloaded";
}
