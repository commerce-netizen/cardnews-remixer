/** 브라우저에서 이미지 파일을 줄여 data URL로 만든다. */
export async function resizeImage(file: File | string, maxSide: number, quality: number): Promise<string> {
  const src = typeof file === "string" ? file : URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("사진을 열 수 없어요. 다른 사진을 골라 주세요."));
      el.src = src;
    });
    const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * ratio);
    canvas.height = Math.round(img.naturalHeight * ratio);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    if (typeof file !== "string") URL.revokeObjectURL(src);
  }
}

export type PreparedImage = { display: string; forAi: string };

/** 화면·저장용(큰 것)과 AI 전송용(작은 것) 두 가지로 준비. AI용은 서버 요청 크기 제한(약 4MB) 안에 맞춘다. */
export async function prepareImages(files: File[]): Promise<PreparedImage[]> {
  const out: PreparedImage[] = [];
  const aiSide = files.length > 6 ? 768 : 1024;
  for (const f of files) {
    out.push({
      display: await resizeImage(f, 1600, 0.9),
      forAi: await resizeImage(f, aiSide, 0.72),
    });
  }
  return out;
}

/** 사진을 정확히 width×height로 꽉 차게(가운데 기준) 잘라 JPEG data URL로 만든다. */
export async function coverCrop(src: string, width: number, height: number, quality = 0.9): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("새 사진을 열 수 없어요. 다시 한 번 눌러 주세요."));
    el.src = src;
  });
  const w = img.naturalWidth || width;
  const h = img.naturalHeight || height;
  const scale = Math.max(width / w, height / h);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, (width - w * scale) / 2, (height - h * scale) / 2, w * scale, h * scale);
  return canvas.toDataURL("image/jpeg", quality);
}
