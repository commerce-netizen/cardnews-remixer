import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import sharp from "sharp";
import { z } from "zod";
import { UserFacingError } from "./errors";
import { IMAGE_MODEL, isMockMode, openai, TEXT_MODEL } from "./openai";

/** 'AI 새 사진' 기능 스위치. 기본 켜짐, NEXT_PUBLIC_ENABLE_IMAGE_GEN=0 이면 끔 */
export const isImageGenEnabled = () => process.env.NEXT_PUBLIC_ENABLE_IMAGE_GEN !== "0";

/**
 * 만드는 방식 — 목표: '원본 색감·음식은 그대로, 구도만 다른, 글자 없는 사진'
 *   edit (기본): 원본 사진을 편집 모델에 직접 넣는다. 음식 질감·색감이 원본 그대로 남는다.
 *                편집 모델은 입력 구도에 끌려가는 성질이 있어서, 넣기 전에 사진을 뒤집고·확대해
 *                구도를 미리 바꿔 두고(reframe), 결과 색감은 원본 색감에 다시 맞춘다(matchColors).
 *   describe:    원본을 글로만 분석해서 같은 요리를 새로 그린다. 구도는 확 달라지지만
 *                원본을 안 보고 그리므로 색감·음식이 달라져 덜 맛있어 보인다(사용자 피드백). 예비용.
 */
const MODE: "describe" | "edit" = process.env.OPENAI_IMAGE_MODE === "describe" ? "describe" : "edit";

type Quality = "low" | "medium" | "high";
// low 는 음식 질감이 뭉개져 덜 맛있어 보여서 기본 medium
const QUALITY: Quality = (["low", "medium", "high"] as const).find((q) => q === process.env.OPENAI_IMAGE_QUALITY) ?? "medium";

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

/**
 * 구도 — 카드뉴스 사진이라 음식이 화면을 꽉 채워야 한다. 이건 변화 축이 아니라 **고정 제약**이다.
 * (이걸 안 박아 두면 그릇이 작게, 한쪽으로 치우쳐 나오고 테이블만 넓게 보인다. 실측 확인)
 */
const FRAMING_RULE = [
  "FRAMING (do not deviate): this is a vertical 4:5 food card. The food MUST FILL THE FRAME.",
  "The dish is centered and takes up at least 85% of the image, cropped in close —",
  "it is fine and expected that the rim of the plate or pan is cut off by the frame edges.",
  "NEVER show large empty areas of table, floor, chairs, walls or background.",
  "NEVER place the dish small, far away, or off to one side of the frame.",
  "음식이 화면을 꽉 채우게, 한가운데에 크게. 접시·팬 테두리는 잘려도 된다.",
  "테이블·바닥·배경이 넓게 보이면 안 되고, 음식이 작게 한쪽에 치우쳐도 안 된다.",
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
 * 바꾸는 축을 넷으로 나눠 각각 따로 뽑는다 (앵글 / 얼마나 가까이 / 무엇이 가운데 / 재료 배치).
 * 하나만 바꾸면 원본과 너무 비슷해 보여서, 매번 네 축을 모두 바꾼다.
 * 단 **구도 제약(음식이 화면을 꽉 채우고 가운데)은 절대 건드리지 않는다** — 카드뉴스 사진이기 때문.
 */
const ANGLES = {
  "top-down": "straight top-down (90°), looking right down into the dish",
  "45-degree": "a 45° three-quarter view, as a diner sitting at the table would shoot it",
  "eye-level": "a low, almost table-height view looking into the food",
  "close-up": "a very tight close-up from slightly above, right next to the food",
} as const;
type Angle = keyof typeof ANGLES;
const ANGLE_KEYS = Object.keys(ANGLES) as Angle[];

/** 전부 '가까이' 쪽 선택지다. 멀리 빼는 선택지는 없다 */
const CLOSENESS = [
  "extremely tight: just a few pieces of the food fill the entire frame, edge to edge",
  "tight: the dish fills the frame and its rim is cropped off on at least two sides",
  "close: the dish fills almost the whole frame, only a sliver of table visible at one edge",
];
/** 무엇을 한가운데 둘지 — 위치가 아니라 '주인공'만 바꾼다 (항상 가운데) */
const HEROES = [
  "center one whole piece of the food, with the rest packed tightly around it",
  "center a piece being lifted by chopsticks or a spoon, filling the middle of the frame",
  "center the part where the sauce or seasoning sits thickest",
  "center a cross-section / torn piece so the inside texture shows",
];
const ARRANGEMENTS = [
  "rearrange where each ingredient sits — the ones at the front move to the back and vice versa",
  "rotate the whole dish so a different ingredient faces the camera, and let the pieces overlap differently",
  "pile the food less neatly — more mixed and tumbled, the way it looks after being served and stirred",
  "spread the pieces differently so a different part of the dish is the most visible",
];
/** 배경은 거의 안 보이지만, 조금 보이는 부분만 바꾼다 */
const SETTINGS = [
  "an ordinary restaurant table, barely visible at one edge",
  "a plain wooden table, only a narrow strip showing",
  "a simple home dining table, mostly hidden behind the food",
  "a stainless steel table edge, just a sliver in one corner",
];

const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

type Variation = { angle: string; closeness: string; hero: string; arrangement: string; setting: string };

/** 원본 앵글은 빼고 네 축을 각각 무작위로 — 누를 때마다 확실히 다른 사진 */
function pickVariation(originalAngle?: Angle): Variation {
  const keys = ANGLE_KEYS.filter((k) => k !== originalAngle);
  return {
    angle: ANGLES[pick(keys.length ? keys : ANGLE_KEYS)],
    closeness: pick(CLOSENESS),
    hero: pick(HEROES),
    arrangement: pick(ARRANGEMENTS),
    setting: pick(SETTINGS),
  };
}

/** 네 축을 모두 바꾸라는 지시 (편집·생성 양쪽이 같이 쓴다) */
function changeRules(v: Variation): string {
  return [
    `- Camera angle: ${v.angle}. This must be clearly different from the input's angle.`,
    `- How close: ${v.closeness}.`,
    `- What is in the center: ${v.hero}.`,
    `- Arrangement of the food: ${v.arrangement}.`,
    `- The little background that shows: ${v.setting}.`,
  ].join("\n");
}

/** 편집 방식에서 바꾸는 것: 구도만. 앵글은 살짝, 배치·가운데 오는 것만 */
const EDIT_CHANGES = [
  "slightly turn the camera — shoot from a little more to the side or a little higher than the input",
  "rotate the dish a bit so a different side of the food faces the camera",
  "move a few pieces of the food so they sit and overlap in a different arrangement",
  "put a different part of the food in the middle of the frame",
];

/** 편집 방식 프롬프트: 음식·색감은 픽셀 수준으로 그대로, 구도·배치만 바꾼다 */
function editPrompt() {
  const changes = [...EDIT_CHANGES].sort(() => Math.random() - 0.5).slice(0, 2);
  return [
    "Edit this food photo. CHANGE ONLY THE COMPOSITION. Everything else must stay exactly as in the input.",
    "",
    "KEEP EXACTLY THE SAME (most important):",
    "- the exact same food: same ingredients, same pieces, same sauce, same doneness, same surface texture and shine",
    "- the exact same colors: same hue, saturation, brightness, contrast, white balance and color temperature as the input",
    "- the same plate / pan / cookware and the same lighting",
    "Do not re-cook, re-color, brighten, darken, desaturate, recolor or restyle the food. It must look just as appetizing as the input.",
    "",
    "CHANGE ONLY:",
    ...changes.map((c) => `- ${c}`),
    "",
    "원본 음식과 색감(채도·밝기·색온도)은 그대로 두고, 구도·배치만 바꿔라. 음식을 다시 그리거나 색을 바꾸지 마라.",
    "",
    "If the input is a multi-panel collage (for example a 2x2 grid of cooking steps), keep that same grid layout.",
    "",
    FRAMING_RULE,
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
  is_collage: z.boolean().describe("여러 장을 한 장에 붙인 사진인지 (예: 조리 과정 2x2 그리드)"),
  collage_layout_en: z
    .string()
    .describe("collage일 때만: layout and what each panel shows (English, short). 아니면 빈 문자열"),
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
    "같은 요리·같은 재료는 유지하고, 앵글·거리·가운데 오는 것·재료 배치는 한눈에 다르게 바꿔라.",
    a.is_collage ? `Keep the same multi-panel layout: ${a.collage_layout_en}. Change each panel's shot, not the layout.` : "",
    "",
    FRAMING_RULE,
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
    FRAMING_RULE,
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
      const framed = await reframe(source.data);
      const file = await toFile(framed, "slide.png", { type: "image/png" });
      const edit = (fidelity: boolean) =>
        client.images.edit({
          ...common,
          image: file,
          prompt: editPrompt(),
          ...(fidelity ? { input_fidelity: "high" as const } : {}),
        });
      // 원본 충실도 '높음'을 켠다. 모델이 이 옵션을 안 받으면 그때만 빼고 한 번 더
      res = await edit(true).catch((e) => {
        if (e instanceof OpenAI.APIError && e.status === 400 && /fidelity/i.test(e.message)) return edit(false);
        throw e;
      });
    }
  }

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new UserFacingError("새 사진을 만들지 못했어요. 다시 한 번 눌러 주세요.");
  if (!source) return `data:image/jpeg;base64,${b64}`;
  // 색감은 원본에 다시 맞춘다 (AI가 색을 바꿔 덜 맛있어 보이는 걸 막음)
  const matched = await matchColors(Buffer.from(b64, "base64"), source.data).catch((e) => {
    console.error("[image-gen] 색감 맞추기 실패", e);
    return null;
  });
  return `data:image/jpeg;base64,${(matched ?? Buffer.from(b64, "base64")).toString("base64")}`;
}

/**
 * 편집 모델에 넣기 전에 구도를 미리 바꿔 둔다 — 좌우 뒤집기 + 다른 곳을 중심으로 살짝 확대.
 * 픽셀을 옮기기만 하므로 색감·음식은 그대로다.
 */
export async function reframe(input: Buffer): Promise<Buffer> {
  const img = sharp(input).rotate();
  const { width = 1080, height = 1350 } = await img.metadata();
  const zoom = 0.82 + Math.random() * 0.1; // 82~92% 영역만 남김
  const w = Math.round(width * zoom);
  const h = Math.round(height * zoom);
  const left = Math.round((width - w) * Math.random());
  const top = Math.round((height - h) * (0.2 + Math.random() * 0.4)); // 위아래 끝(글자 띠)은 덜 고름
  let out = img.extract({ left, top, width: w, height: h });
  if (Math.random() < 0.7) out = out.flop(); // 좌우 뒤집기
  return out.resize(width, height, { fit: "fill" }).png().toBuffer();
}

/**
 * 결과 사진의 색감(채널별 평균·대비)을 원본 사진에 맞춘다.
 * 원본 통계는 가운데 영역에서만 잰다 — 카드뉴스 위아래 글자 띠·그라데이션이 섞이지 않게.
 */
export async function matchColors(out: Buffer, ref: Buffer): Promise<Buffer> {
  // 가운데 영역의 채널별 평균·표준편차 + 평균 채도
  const stats = async (buf: Buffer) => {
    const small = await sharp(buf).rotate().resize(256, 320, { fit: "fill" }).toBuffer();
    const { data } = await sharp(small)
      .extract({ left: 38, top: 64, width: 180, height: 192 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const n = data.length / 3;
    const sum = [0, 0, 0];
    const sq = [0, 0, 0];
    let sat = 0;
    for (let i = 0; i < data.length; i += 3) {
      const px = [data[i], data[i + 1], data[i + 2]];
      for (let c = 0; c < 3; c++) { sum[c] += px[c]; sq[c] += px[c] ** 2; }
      const mx = Math.max(...px);
      sat += mx ? (mx - Math.min(...px)) / mx : 0;
    }
    const ch = sum.map((m, c) => ({ mu: m / n, sd: Math.sqrt(Math.max(1, sq[c] / n - (m / n) ** 2)) }));
    return { ch, sat: sat / n };
  };
  const STRENGTH = 0.8; // 100%로 맞추면 부자연스러울 때가 있어 80%만
  const ref0 = await stats(ref);
  const out0 = await stats(out);

  // 1) 채널별 밝기·색온도 맞추기
  const r = ref0.ch, o = out0.ch;
  const gain = o.map((s, c) => Math.min(1.35, Math.max(0.75, r[c].sd / s.sd)));
  const lut = [0, 1, 2].map((c) =>
    Uint8ClampedArray.from({ length: 256 }, (_, v) => {
      const t = (v - o[c].mu) * gain[c] + r[c].mu;
      return Math.round(v + (t - v) * STRENGTH);
    }),
  );
  const { data, info } = await sharp(out).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 3) for (let c = 0; c < 3; c++) data[i + c] = lut[c][data[i + c]];
  const toned = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();

  // 2) 채도 맞추기 (음식이 칙칙해지는 게 '덜 맛있어 보이는' 가장 큰 원인)
  const sat1 = (await stats(toned)).sat;
  const ratio = sat1 > 0.01 ? ref0.sat / sat1 : 1;
  const satGain = Math.min(1.5, Math.max(0.8, 1 + (ratio - 1) * STRENGTH));
  return sharp(toned).modulate({ saturation: satGain }).jpeg({ quality: 92 }).toBuffer();
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
