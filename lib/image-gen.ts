import { toFile } from "openai";
import { UserFacingError } from "./errors";
import { IMAGE_MODEL, isMockMode, openai } from "./openai";

/** 'AI 새 사진' 기능 스위치. 기본 켜짐, NEXT_PUBLIC_ENABLE_IMAGE_GEN=0 이면 끔 */
export const isImageGenEnabled = () => process.env.NEXT_PUBLIC_ENABLE_IMAGE_GEN !== "0";

type Quality = "low" | "medium" | "high";
// 저비용 기본값 low
const QUALITY: Quality = (["low", "medium", "high"] as const).find((q) => q === process.env.OPENAI_IMAGE_QUALITY) ?? "low";

/**
 * 출력 크기: 카드뉴스는 1080×1350(4:5).
 * gpt-image-2.5 계열은 임의 크기(가로·세로 16의 배수)를 받으므로 정확히 4:5인 1088×1360으로 만들고,
 * 그 외 모델은 표준 세로 크기 1024×1536으로 만든다. 어느 쪽이든 브라우저에서 1080×1350으로 꽉 차게 잘라 쓴다.
 */
const SIZE = /^gpt-image-2\.5/.test(IMAGE_MODEL) ? "1088x1360" : "1024x1536";

/** 사진 속 글자 제거 지시 — 원본 카드뉴스 사진엔 자막·박스·워터마크가 박혀 있어도 결과엔 글자가 하나도 없어야 한다 */
const NO_TEXT_RULE = [
  "CRITICAL — REMOVE ALL TEXT: The input photo may have text burned into it: titles, captions, subtitles, text boxes,",
  'semi-transparent caption boxes, watermarks (e.g. "맛집도둑"), the "[광고]" ad label, logos, stickers or banners.',
  "Completely remove every one of them. The output must be a clean food photo with absolutely NO text of any kind:",
  "no letters, no numbers, no Korean or English characters, no captions, no text boxes, no watermarks, no labels, no logos.",
  "Do not add any new text either. Where text or boxes were, show only natural food, dishes and background.",
  "원본 사진에 박혀 있는 모든 텍스트·자막·텍스트박스·워터마크·[광고] 라벨을 완전히 제거하고, 글자가 하나도 없는 깨끗한 음식 사진만 만들어라.",
].join("\n");

const REMAKE_PROMPT = [
  "Create a NEW photo of the same food shown in the input image, for a vertical 4:5 Instagram card.",
  "Keep the same dish: the same food items, ingredients, sauce colors, cooking state and overall look must stay recognizably identical.",
  "But make it a clearly different shot: change the composition, arrangement of the food, camera angle and plating/serving style",
  "(for example top-down vs. 45-degree view, a different bowl or pan position, a different garnish placement).",
  "Realistic, appetizing food photography, natural light, sharp focus, the food fills the vertical frame.",
  "같은 음식은 그대로 유지하되 구도·배치·앵글·플레이팅을 다르게 바꾼 새 사진을 만들어라.",
  "",
  NO_TEXT_RULE,
].join("\n");

/** 원본 사진이 없을 때(글만 있는 장) 글 내용으로 새로 만드는 프롬프트 */
function textPrompt(topic: string) {
  return [
    "A vertical 4:5 appetizing food photo for an Instagram card news slide, realistic food photography, natural light.",
    `Subject (Korean description, do NOT write it in the image): ${topic.slice(0, 300)}`,
    "",
    NO_TEXT_RULE,
  ].join("\n");
}

export type ImageGenRequest = { image?: string | null; title?: string; body?: string };

function parseDataUrl(d: string): { type: string; data: Buffer } {
  const m = d.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new UserFacingError("사진 형식이 올바르지 않아요. 사진을 다시 넣어 주세요.");
  return { type: m[1], data: Buffer.from(m[2], "base64") };
}

/**
 * 슬라이드 원본 사진을 이미지 편집 모델에 보내 '같은 음식, 다른 구도'의 새 사진을 만든다.
 * 원본 사진이 없으면 슬라이드 글로 새로 만든다. 결과는 JPEG data URL.
 */
export async function remakeSlideImage({ image, title = "", body = "" }: ImageGenRequest): Promise<string> {
  const topic = `${title}\n${body}`.trim();
  if (!image && !topic) throw new UserFacingError("먼저 사진을 넣거나 글을 적어 주세요.");
  const source = image ? parseDataUrl(image) : null;
  if (isMockMode()) return mockImage();

  const common = {
    model: IMAGE_MODEL,
    n: 1,
    size: SIZE,
    quality: QUALITY,
    output_format: "jpeg" as const,
    output_compression: 85,
  };
  // 비용 보호: 이미지 생성은 실패해도 자동 재시도하지 않음
  const client = openai({ maxRetries: 0, timeout: 150_000 });
  const res = source
    ? await client.images.edit({
        ...common,
        image: await toFile(source.data, `slide.${source.type.split("/")[1]}`, { type: source.type }),
        prompt: REMAKE_PROMPT,
      })
    : await client.images.generate({ ...common, prompt: textPrompt(topic) });

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new UserFacingError("새 사진을 만들지 못했어요. 다시 한 번 눌러 주세요.");
  return `data:image/jpeg;base64,${b64}`;
}

/** 데모 모드: 실제 호출 대신 글자 없는 그러데이션 자리표시 사진 */
function mockImage(): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">' +
    '<defs><radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#f4a261"/>' +
    '<stop offset="0.55" stop-color="#c8553d"/><stop offset="1" stop-color="#3d2b24"/></radialGradient></defs>' +
    '<rect width="100%" height="100%" fill="url(#g)"/>' +
    '<circle cx="540" cy="600" r="330" fill="#2b2b2b" opacity="0.85"/><circle cx="540" cy="600" r="290" fill="#d1495b"/>' +
    "</svg>";
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
