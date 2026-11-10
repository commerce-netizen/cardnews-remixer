import { coverCrop, resizeImage } from "./client-images";
import { postAi } from "./ai-fetch";

/** 'AI 새 사진' 켜짐 여부 (빌드 시 값이 들어감). 기본 켜짐, "0"이면 끔 */
export const IMAGE_GEN_ENABLED = process.env.NEXT_PUBLIC_ENABLE_IMAGE_GEN !== "0";

/**
 * 한 장의 사진을 'AI 새 사진'으로 바꾼다.
 * 지금 사진을 적당한 크기로 줄여 보내고, 받은 사진을 1080×1350으로 꽉 차게 잘라 돌려준다.
 */
export async function makeAiPhoto(
  image: string | null,
  title: string,
  body: string,
  width: number,
  height: number,
): Promise<string> {
  const source = image ? await resizeImage(image, 1536, 0.85) : null;
  const fail = "새 사진을 만들지 못했어요. 다시 한 번 눌러 주세요.";
  const data = await postAi<{ image?: string }>("/api/image-gen", { image: source, title, body }, fail);
  if (!data.image) throw new Error(fail);
  return coverCrop(data.image, width, height);
}
