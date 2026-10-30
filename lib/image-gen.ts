import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { UserFacingError } from "./errors";
import { IMAGE_MODEL, isMockMode, openai, TEXT_MODEL } from "./openai";

/** 'AI 새 사진' 기능 스위치. 기본 켜짐, NEXT_PUBLIC_ENABLE_IMAGE_GEN=0 이면 끔 */
export const isImageGenEnabled = () => process.env.NEXT_PUBLIC_ENABLE_IMAGE_GEN !== "0";

/**
 * 만드는 방식 — 목표: '사실적이면서도 구도·배치가 한눈에 다른, 글자 없는 사진'
 *   describe (기본): 원본을 비전으로 분석(요리·재료·사진 느낌) → 같은 요리를 새로 생성.
 *                    원본 사진을 이미지 모델에 넣지 않으므로 구도·재료 배치가 실제로 달라진다.
 *                    사실감은 REALISM_RULE + 분석이 뽑아낸 photo_look_en 으로 유지한다.
 *   edit:            원본 사진을 편집 모델에 넣는다. 질감은 가장 비슷하지만 **입력 이미지 구조에 강하게
 *                    고정돼 구도·재료 배치가 거의 그대로 남는다**(실측 확인). 분석 실패 시 대체용으로도 쓴다.
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

/** 사실감 — 미화·보정 없이 실제로 찍은 사진처럼 (AI 티 금지) */
const REALISM_RULE = [
  "PHOTOREALISM: it must look like an ordinary real photo actually taken with a camera or phone — not AI-generated.",
  "Do NOT beautify, enhance, idealize or stylize the food. Do not make it look better or more attractive than the original.",
  "Keep the original photo's real textures, imperfections, natural lighting, color tone, white balance, sharpness, grain and overall mood.",
  "Avoid anything that looks AI-made: no over-smooth or plastic surfaces, no overly perfect or symmetric arrangements,",
  "no glossy CGI look, no added dramatic lighting, no exaggerated colors or saturation, no artificial blur or bokeh effects.",
  "실제로 찍은 사진처럼 자연스럽고 사실적으로(photorealistic). AI로 생성한 티가 안 나게, 과하게 완벽하거나 매끈하게 스타일라이즈하지 말 것.",
  "음식을 예쁘게 꾸미거나 과장하지 말고, 원본 사진의 사실적인 질감·분위기를 그대로 유지할 것.",
].join("\n");

/** 글자·그래픽 제거 — 원본 카드뉴스엔 자막·박스·그라데이션·워터마크가 박혀 있어도 결과엔 하나도 없어야 한다 */
const CLEAN_RULE = [
  "REMOVE ALL TEXT AND GRAPHIC OVERLAYS: the input card-news photo has things burned into it —",
  "titles, captions, subtitles, a semi-transparent text box, a dark gradient band at the bottom, watermarks",
  '(e.g. "맛집도둑"), the "[광고]" ad label, logos, stickers, frames, borders. Remove every one of them completely.',
  "Where they covered the photo, show the real food, dish and table naturally as if nothing was ever there.",
  "The output must be a clean full-bleed photo with no letters, no numbers, no Korean or English characters, no captions,",
  "no text boxes, no translucent panels, no gradient bars, no watermarks, no labels, no logos, no borders. Do not add any new text.",
  "원본 사진에 박혀 있는 모든 텍스트·자막·워터마크·[광고] 라벨·하단 그라데이션·반투명 텍스트박스를 완전히 제거하고,",
  "글자나 그래픽 오버레이가 하나도 없는 깨끗한 사진만 만들어라.",
].join("\n");

/*
 * 바꾸는 축을 넷으로 나눠 각각 따로 뽑는다 (앵글 / 거리·크롭 / 프레임 안 위치 / 재료 배치).
 * 하나만 바꾸면 원본과 너무 비슷해 보여서, 매번 네 축을 모두 바꾸게 한다.
 * 다만 바꾸는 방향은 '실제로 다시 찍은 것 같은' 평범한 선택지 안에서만 고른다.
 */
const ANGLES = {
  "top-down": "straight top-down (90°), looking right down at the dish",
  "45-degree": "a 45° three-quarter view, as a diner sitting at the table would shoot it",
  "eye-level": "a low, almost table-height side view",
  "close-up": "a tight close-up from slightly above, very near the food",
} as const;
type Angle = keyof typeof ANGLES;
const ANGLE_KEYS = Object.keys(ANGLES) as Angle[];

const DISTANCES = [
  "much closer than the input — the food fills almost the whole frame and the rim of the pan/plate is cropped off",
  "a little closer, cropping one edge of the pan/plate",
  "further back, showing the whole dish plus a good amount of the table around it",
];
const FRAME_POSITIONS = [
  "put the dish clearly off-center, toward the left of the frame",
  "put the dish clearly off-center, toward the right of the frame",
  "put the dish low in the frame with more empty table above it",
  "put the dish high in the frame with more table below it",
];
const ARRANGEMENTS = [
  "rearrange where each ingredient sits — the ones at the front move to the back and vice versa, and the groups are in a different order around the pan/plate",
  "rotate the whole dish so a different ingredient faces the camera, and let the ingredients overlap each other differently",
  "pile the ingredients less neatly — more mixed together and tumbled, the way it looks after being served and stirred",
  "spread the ingredients out differently so a different part of the dish is the most visible",
];
const SETTINGS = [
  "an ordinary Korean restaurant table with a couple of everyday side dishes and a water cup nearby",
  "a plain wooden table in a casual neighborhood restaurant",
  "a simple home dining table with everyday utensils",
  "a stainless steel table of a busy casual eatery",
  "a light-colored table by a window with ordinary daylight",
];

const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

type Variation = { angle: string; distance: string; framePos: string; arrangement: string; setting: string };

/** 원본 앵글은 빼고 네 축을 각각 무작위로 — 누를 때마다 확실히 다른 사진 */
function pickVariation(originalAngle?: Angle): Variation {
  const keys = ANGLE_KEYS.filter((k) => k !== originalAngle);
  return {
    angle: ANGLES[pick(keys.length ? keys : ANGLE_KEYS)],
    distance: pick(DISTANCES),
    framePos: pick(FRAME_POSITIONS),
    arrangement: pick(ARRANGEMENTS),
    setting: pick(SETTINGS),
  };
}

/** 네 축을 모두 바꾸라는 지시 (편집·생성 양쪽이 같이 쓴다) */
function changeRules(v: Variation): string {
  return [
    `- Camera angle: ${v.angle}. This must be clearly different from the input's angle.`,
    `- Distance / crop: ${v.distance}.`,
    `- Position in frame: ${v.framePos}.`,
    `- Arrangement of the food: ${v.arrangement}.`,
    `- Background / table: ${v.setting}.`,
  ].join("\n");
}

/** 편집 방식 프롬프트: 같은 요리·재료·사진 느낌은 유지하되 구도·배치는 확실히 다르게 */
function editPrompt(v: Variation) {
  return [
    "Re-shoot this exact same food as a NEW photo taken at a different moment, from a different position.",
    "The result must look CLEARLY DIFFERENT from the input at first glance — a genuinely different shot,",
    "not the same shot with small edits. Do not reproduce the input's framing, angle or layout.",
    "",
    "KEEP: the same dish, the same ingredients and the same amounts, the same cookware/plate,",
    "and the same real photographic look — lighting, color tone, sharpness, grain, mood (see PHOTOREALISM).",
    "",
    "CHANGE ALL OF THESE:",
    changeRules(v),
    "",
    "같은 요리·같은 재료·같은 그릇·같은 사진 느낌은 그대로 두고,",
    "앵글·거리·화면 속 위치·재료들의 배치·배경은 한눈에 다르게 바꿔라. 원본 구도를 따라 하지 마라.",
    "",
    REALISM_RULE,
    "",
    CLEAN_RULE,
  ].join("\n");
}

const AnalysisSchema = z.object({
  dish_name_ko: z.string().describe("요리 이름 (한글)"),
  dish_name_en: z.string().describe("dish name in English"),
  dish_description_en: z
    .string()
    .describe("plain, factual English description of the food only: components, ingredients, sauce, cookware. Ignore any text/overlays."),
  key_ingredients_en: z.array(z.string()).describe("visible key ingredients that must stay, in English"),
  photo_look_en: z
    .string()
    .describe("how the photo itself looks: lighting, color tone, sharpness, phone-or-camera feel, mood (English, short, factual)"),
  original_angle: z.enum(["top-down", "45-degree", "eye-level", "close-up"]).describe("camera angle of the reference photo"),
  original_background_en: z.string().describe("background/surface/setting of the reference (English, short)"),
});
type Analysis = z.infer<typeof AnalysisSchema>;

const ANALYZE_INSTRUCTIONS = `You analyze a food photo taken from a Korean Instagram card-news post, so an image model can re-take the same dish realistically.
Describe only the real scene, plainly and factually — no praise or marketing words. Completely ignore anything overlaid on the photo:
titles, captions, text boxes, gradients, watermarks, "[광고]" labels.`;

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

/** 분석 결과로 '같은 요리를 다시 찍은 사실적인 사진' 프롬프트 */
function describedPrompt(a: Analysis, v: Variation) {
  return [
    "A realistic, unedited-looking photo of a real dish, vertical 4:5.",
    `Dish: ${a.dish_name_en} (${a.dish_name_ko}). ${a.dish_description_en}`,
    `Same ingredients, clearly visible: ${a.key_ingredients_en.join(", ")}. Do not add unrelated foods.`,
    `Photo look to match (keep it the same): ${a.photo_look_en}.`,
    "",
    "Shoot it clearly differently from the reference — all of these:",
    changeRules(v),
    `(The reference was ${a.original_angle} on ${a.original_background_en} — do not reuse that angle or background.)`,
    "같은 요리·같은 재료는 유지하고, 앵글·거리·화면 속 위치·재료 배치·배경은 한눈에 다르게 바꿔라.",
    "",
    REALISM_RULE,
    "",
    CLEAN_RULE,
  ].join("\n");
}

/** 원본 사진이 없을 때(글만 있는 장) 글 내용으로 만드는 프롬프트 */
function textPrompt(topic: string) {
  return [
    "A realistic, unedited-looking everyday photo of the food described below, vertical 4:5, as if taken with a phone at a restaurant.",
    `Subject (Korean description, do NOT write it in the image): ${topic.slice(0, 300)}`,
    `Setting: ${pick(SETTINGS)}.`,
    "",
    REALISM_RULE,
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
 * 슬라이드 사진을 '원본처럼 사실적이지만 구도·배경·배치만 바뀐, 글자 없는' 새 사진으로 바꾼다.
 * 원본 사진이 없으면 슬라이드 글로 만든다. 결과는 JPEG data URL.
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
    output_compression: 90,
  };
  // 비용 보호: 이미지 생성은 실패해도 자동 재시도하지 않음
  const client = openai({ maxRetries: 0, timeout: 150_000 });

  let res;
  if (!source) {
    res = await client.images.generate({ ...common, prompt: textPrompt(topic) });
  } else {
    const analysis = MODE === "describe" ? await analyze(client, image!) : null;
    if (analysis) {
      res = await client.images.generate({
        ...common,
        prompt: describedPrompt(analysis, pickVariation(analysis.original_angle)),
      });
    } else {
      res = await client.images.edit({
        ...common,
        image: await toFile(source.data, `slide.${source.type.split("/")[1]}`, { type: source.type }),
        prompt: editPrompt(pickVariation()),
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
