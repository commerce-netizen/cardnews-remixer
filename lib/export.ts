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
