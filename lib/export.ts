import { getFontEmbedCSS, toBlob } from "html-to-image";
import JSZip from "jszip";
import { SLIDE_H, SLIDE_W } from "@/components/SlideCard";

/** 슬라이드 요소들을 1080×1350 PNG로 만든다. */
export async function renderSlides(
  nodes: HTMLElement[],
  onProgress?: (done: number) => void,
): Promise<Blob[]> {
  await document.fonts.ready;
  const fontEmbedCSS = await getFontEmbedCSS(nodes[0]);
  const blobs: Blob[] = [];
  for (const node of nodes) {
    const blob = await toBlob(node, {
      width: SLIDE_W,
      height: SLIDE_H,
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

export async function downloadZip(blobs: Blob[], caption: string): Promise<void> {
  const zip = new JSZip();
  blobs.forEach((b, i) => zip.file(`slide_${String(i + 1).padStart(2, "0")}.png`, b));
  zip.file("caption.txt", caption);
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
