import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { UserFacingError } from "./errors";
import { IMAGE_MODEL, isMockMode, openai, TEXT_MODEL } from "./openai";

/** 'AI 새 사진' 기능 스위치. 기본 켜짐, NEXT_PUBLIC_ENABLE_IMAGE_GEN=0 이면 끔 */
export const isImageGenEnabled = () => process.env.NEXT_PUBLIC_ENABLE_IMAGE_GEN !== "0";

/**
 * 만드는 방식
 *   describe (기본): 원본 사진을 비전으로 분석 → 같은 요리를 '새로' 생성. 원본 사진을 이미지 모델에 넣지 않으므로
 *                    구도가 확실히 달라지고, 원본에 박힌 글자·박스·그라데이션이 옮겨 올 길이 없다.
 *   edit:            원본 사진을 이미지 편집 모델에 넣어 바꾼다 (원본을 더 닮음). 분석이 실패하면 자동으로 이 방식을 쓴다.
 */
const MODE: "describe" | "edit" = process.env.OPENAI_IMAGE_MODE === "edit" ? "edit" : "describe";

type Quality = "low" | "medium" | "high";
// 저비용 기본값 low
const QUALITY: Quality = (["low", "medium", "high"] as const).find((q) => q === process.env.OPENAI_IMAGE_QUALITY) ?? "low";

/**
 * 출력 크기: 카드뉴스는 1080×1350(4:5).
 * gpt-image-2.5 계열은 임의 크기(가로·세로 16의 배수)를 받으므로 정확히 4:5인 1088×1360으로 만들고,
 * 그 외 모델은 표준 세로 크기 1024×1536으로 만든다. 어느 쪽이든 브라우저에서 1080×1350으로 꽉 차게 잘라 쓴다.
 */
const SIZE = /^gpt-image-2\.5/.test(IMAGE_MODEL) ? "1088x1360" : "1024x1536";

/** 글자·그래픽 제거 지시 — 원본 카드뉴스엔 자막·박스·그라데이션·워터마크가 박혀 있어도 결과엔 하나도 없어야 한다 */
const CLEAN_RULE = [
  "ABSOLUTELY NO TEXT OR GRAPHIC OVERLAYS: the reference card-news photo has things burned into it —",
  "titles, captions, subtitles, a semi-transparent text box, a dark gradient band at the bottom, watermarks",
  '(e.g. "맛집도둑"), the "[광고]" ad label, logos, stickers, frames, borders. None of these may appear.',
  "The output must be a clean, natural, full-bleed food photograph only: no letters, no numbers, no Korean or English characters,",
  "no captions, no text boxes, no translucent panels, no gradient bars or vignette bands, no watermarks, no labels, no logos, no borders.",
  "원본 사진에 박혀 있는 모든 텍스트·자막·워터마크·[광고] 라벨·하단 그라데이션·반투명 텍스트박스를 완전히 제거하고,",
  "글자나 그래픽 오버레이가 하나도 없는 깨끗한 음식 사진만 만들어라.",
].join("\n");

/** 더 맛있어 보이게 — 전문 푸드 포토그래피 */
function deliciousRule(hot: boolean) {
  return [
    "Make it look MORE delicious than the reference: high-end professional food photography, magazine/advertising quality.",
    "Appetizing warm key light with soft natural shadows, crisp and sharp textures, glossy sheen on sauces and glazes,",
    "vivid rich natural colors, appetizing highlights, shallow depth of field with a creamy blurred background.",
    hot ? "The dish is freshly cooked and hot: visible soft wisps of rising steam." : "Fresh, just-served look.",
    "전문 푸드 포토그래피 퀄리티로, 먹음직스러운 조명·선명한 질감·모락모락 김·윤기·생생한 색감을 강조하라.",
  ].join("\n");
}

/* 원본과 확실히 다르게: 카메라 앵글·배경 후보 (원본 앵글은 제외하고 무작위로 골라 누를 때마다 다른 사진) */
const ANGLES = {
  "top-down": "straight top-down flat lay (90°) showing the whole dish as a graphic composition",
  "45-degree": "classic 45-degree three-quarter view, the dish filling the frame",
  "eye-level": "low eye-level side view close to the table surface, dramatic depth",
  "close-up": "tight close-up of the most delicious part, chopsticks or a spoon lifting a juicy bite toward the camera",
} as const;
type Angle = keyof typeof ANGLES;
const ANGLE_KEYS = Object.keys(ANGLES) as Angle[];

const BACKGROUNDS = [
  "dark slate stone tabletop with moody low-key lighting",
  "warm rustic wooden table in a cozy Korean restaurant, a few small side dishes (banchan) softly blurred around",
  "clean white marble counter in bright airy daylight",
  "Korean street-food stall table at night with warm golden bokeh lights behind",
  "light linen tablecloth next to a sunny window, fresh morning light",
  "deep navy-blue matte table with a single warm spotlight",
];

const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

const AnalysisSchema = z.object({
  is_food: z.boolean().describe("주 피사체가 음식인지"),
  dish_name_ko: z.string().describe("요리 이름 (한글)"),
  dish_name_en: z.string().describe("dish name in English"),
  dish_description_en: z
    .string()
    .describe("detailed English description of the food only: components, ingredients, sauce, colors, textures, cookware. Ignore any text/overlays."),
  key_ingredients_en: z.array(z.string()).describe("visible key ingredients that must stay, in English"),
  is_hot_dish: z.boolean().describe("hot/steaming dish?"),
  original_angle: z.enum(["top-down", "45-degree", "eye-level", "close-up"]).describe("camera angle of the reference photo"),
  original_composition_en: z.string().describe("how food is arranged/framed in the reference (English, short)"),
  original_background_en: z.string().describe("background/surface/setting of the reference (English, short)"),
  alternative_plating_en: z
    .string()
    .describe("a clearly different but natural way to plate/serve this same dish (different vessel, portion or arrangement), English"),
});
type Analysis = z.infer<typeof AnalysisSchema>;

const ANALYZE_INSTRUCTIONS = `You analyze a food photo taken from a Korean Instagram card-news post, so an image model can re-shoot the same dish from scratch.
Describe only the real food scene. Completely ignore anything overlaid on the photo: titles, captions, text boxes, gradients, watermarks, "[광고]" labels.
Be specific about the dish and ingredients so the same food can be recreated faithfully.`;

async function analyze(client: OpenAI, image: string): Promise<Analysis | null> {
  const res = await client.responses
    .parse({
      model: TEXT_MODEL,
      instructions: ANALYZE_INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: [
            { type: "input_image", image_url: image, detail: "low" },
            { type: "input_text", text: "Analyze this photo." },
          ],
        },
      ],
      text: { format: zodTextFormat(AnalysisSchema, "food_photo_analysis") },
      reasoning: { effort: "low" },
      max_output_tokens: 3000,
      store: false,
    })
    .catch((e) => {
      if (e instanceof OpenAI.APIError) throw e; // 한도·키 문제는 그대로 알림
      console.error("[image-gen] 분석 응답 해석 실패", e);
      return null;
    });
  if (!res || res.status === "incomplete") return null;
  return res.output_parsed;
}

/** 분석 결과로 '같은 요리, 확실히 다른 새 사진' 프롬프트 */
function buildDescribedPrompt(a: Analysis, angle: Angle, background: string) {
  const subject = a.is_food ? "food" : "product";
  return [
    `Professional ${subject} photography for a vertical 4:5 Instagram card. Photorealistic.`,
    `Dish: ${a.dish_name_en} (${a.dish_name_ko}). ${a.dish_description_en}`,
    `Keep the same kind of dish and these ingredients clearly visible: ${a.key_ingredients_en.join(", ")}. Do not add unrelated foods.`,
    "",
    "This must be a completely NEW shot that looks clearly different from the reference at first glance. Be bold:",
    `- Camera angle: ${ANGLES[angle]}. (The reference was ${a.original_angle} — do NOT use that angle.)`,
    `- Plating / arrangement: ${a.alternative_plating_en}. (The reference was: ${a.original_composition_en} — do NOT copy it.)`,
    `- Background / setting: ${background}. (The reference was: ${a.original_background_en} — do NOT reuse it.)`,
    "원본의 요리 종류·재료는 유지하되 구도·배치·카메라 앵글·배경은 한눈에 다르게 과감하게 바꿔라.",
    "",
    deliciousRule(a.is_hot_dish),
    "",
    CLEAN_RULE,
  ].join("\n");
}

/** 편집(img2img) 방식 프롬프트 — 원본을 넣되 최대한 과감하게 바꾸라고 지시 */
const EDIT_PROMPT = [
  "Re-shoot the food from the input photo as a brand-new, professional photo for a vertical 4:5 Instagram card.",
  "Keep the same kind of dish and the same ingredients, but make the result clearly different from the input at first glance. Be bold:",
  "use a different camera angle, a different arrangement/plating, and a completely different background and table setting.",
  "Do not preserve the input's framing or layout.",
  "원본의 요리 종류·재료는 유지하되 구도·배치·카메라 앵글·배경은 한눈에 다르게 과감하게 바꿔라.",
  "",
  deliciousRule(true),
  "",
  CLEAN_RULE,
].join("\n");

/** 원본 사진이 없을 때(글만 있는 장) 글 내용으로 새로 만드는 프롬프트 */
function textPrompt(topic: string) {
  return [
    "A vertical 4:5 food photo for an Instagram card news slide. Photorealistic.",
    `Subject (Korean description, do NOT write it in the image): ${topic.slice(0, 300)}`,
    `Camera angle: ${ANGLES[pick(ANGLE_KEYS)]}. Background: ${pick(BACKGROUNDS)}.`,
    "",
    deliciousRule(true),
    "",
    CLEAN_RULE,
  ].join("\n");
}

export type ImageGenRequest = { image?: string | null; title?: string; body?: string };

function parseDataUrl(d: string): { type: string; data: Buffer } {
  const m = d.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new UserFacingError("사진 형식이 올바르지 않아요. 사진을 다시 넣어 주세요.");
  return { type: m[1], data: Buffer.from(m[2], "base64") };
}

/**
 * 슬라이드 사진을 '같은 요리, 확실히 다른 구도·배경, 더 맛있어 보이는, 글자 없는' 새 사진으로 바꾼다.
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

  let res;
  if (!source) {
    res = await client.images.generate({ ...common, prompt: textPrompt(topic) });
  } else {
    const analysis = MODE === "describe" ? await analyze(client, image!) : null;
    if (analysis) {
      const angle = pick(ANGLE_KEYS.filter((k) => k !== analysis.original_angle));
      res = await client.images.generate({ ...common, prompt: buildDescribedPrompt(analysis, angle, pick(BACKGROUNDS)) });
    } else {
      // 편집 방식 (설정했거나 분석이 실패했을 때)
      res = await client.images.edit({
        ...common,
        image: await toFile(source.data, `slide.${source.type.split("/")[1]}`, { type: source.type }),
        prompt: EDIT_PROMPT,
      });
    }
  }

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
