import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import sharp from "sharp";
import { z } from "zod";
import { UserFacingError } from "./errors";
import {
  BASE_STYLE, FONT_STYLES, FONT_STYLE_KEYS, SLIDE_W, blockId, clampRatio, newBlock,
  type FontStyleKey, type LayoutResult, type TextBlock, type TextRole,
} from "./layout";
import { isMockMode, openai, TEXT_MODEL } from "./openai";
import { toDataUrls } from "./remix";
import type { RemixRequest } from "./types";

/**
 * '원본 디자인 그대로' 각색.
 *   1단계(장마다 동시에): 슬라이드 한 장을 보고 글 상자 위치·크기·글꼴 느낌·색·효과를 읽는다.
 *   2단계(한 번): 모든 장의 원문을 보고, 같은 자리·같은 길이에 들어갈 새 글과 캡션을 쓴다.
 * 주제(음식·패션·정치·시사·매거진 …)와 템플릿에 상관없이 같은 방식이다.
 */

const LAYOUT_MODEL = process.env.OPENAI_LAYOUT_MODEL || TEXT_MODEL;

class LayoutError extends UserFacingError {}

const ROLES = ["title", "subtitle", "body", "label", "number", "source", "handle", "other"] as const;
const hex = () => z.string().describe("#rrggbb");

const SlideSchema = z.object({
  background: hex().describe("슬라이드 바탕의 주된 색 (사진이 꽉 차면 사진의 평균 색)"),
  photo_share: z.number().describe("사진·일러스트가 슬라이드에서 차지하는 비율 0~100"),
  texts: z.array(
    z.object({
      role: z.enum(ROLES),
      text: z.string().describe("이 상자의 글을 보이는 그대로. 줄이 바뀌는 곳마다 \\n"),
      x0: z.number().describe("글 상자 왼쪽 끝 (0~1000, 슬라이드 폭 기준)"),
      y0: z.number().describe("글 상자 위쪽 끝 (0~1000, 슬라이드 높이 기준)"),
      x1: z.number().describe("글 상자 오른쪽 끝 (0~1000)"),
      y1: z.number().describe("글 상자 아래쪽 끝 (0~1000)"),
      font_style: z.enum(FONT_STYLE_KEYS as [FontStyleKey, ...FontStyleKey[]]),
      weight: z.enum(["light", "regular", "bold", "black"]),
      size_px: z.number().describe("한글 글자 하나의 높이(px). 슬라이드 폭을 1080px로 볼 때"),
      color: hex(),
      behind: hex().describe("이 글 바로 뒤에 깔린 색 (글상자가 있으면 그 색, 없으면 글 주변 배경색)"),
      align: z.enum(["left", "center", "right"]),
      box: z.boolean().describe("글 뒤에 색 상자·띠·말풍선이 따로 깔려 있는지"),
      box_color: hex(),
      box_opacity: z.number().describe("글상자 진하기 0~100 (상자가 없으면 0)"),
      effect: z.enum(["none", "outline", "shadow"]).describe("글자 테두리(outline)나 그림자(shadow)"),
      effect_color: hex(),
      accent: z.string().describe("다른 색으로 강조된 낱말 (없으면 빈 문자열)"),
      accent_color: hex().describe("강조 낱말 색 (없으면 글자색과 같게)"),
    }),
  ),
});
type SlideAnalysis = z.infer<typeof SlideSchema>;

const ANALYZE = `당신은 카드뉴스 디자인을 그대로 따라 만들기 위해 슬라이드 한 장의 '글 배치'를 측정하는 디자이너입니다.
주제는 음식·패션·뷰티·정치·시사·경제·매거진·정보 등 무엇이든 될 수 있습니다.

- 슬라이드에 보이는 모든 글을 덩어리(글 상자)별로 빠짐없이 찾습니다. 제목·부제목·본문·작은 머리말/태그·번호·출처/날짜·계정 이름(@아이디, 워터마크)·기타.
  한 덩어리 = 같은 글꼴·크기·색으로 붙어 있는 글. 크기나 색이 다르면 다른 상자로 나눕니다.
- 사진 속 간판·상품 포장·옷의 로고처럼 '사진의 일부'인 글은 빼고, 디자인으로 얹힌 글만 찾습니다.
- 좌표는 0~1000 비율로, 실제 글자가 차지하는 영역에 딱 맞게 잽니다.
- text 는 보이는 글자 그대로 옮기고, 슬라이드에서 줄이 바뀌는 곳에 \\n 을 넣습니다.
- font_style 은 아래 중 가장 비슷한 것:
${FONT_STYLE_KEYS.map((k) => `  ${k}: ${FONT_STYLES[k].desc}`).join("\n")}
- 색은 실제로 보이는 색을 #rrggbb 로. 글자 테두리가 있으면 effect=outline, 그림자가 있으면 shadow.
- 글자 뒤에 따로 깔린 색 상자·띠·형광펜·말풍선이 있으면 box=true 와 그 색·진하기.
- 글 중 일부 낱말만 다른 색이면 accent 에 그 낱말을 적습니다.`;

async function analyzeSlide(client: OpenAI, image: string): Promise<SlideAnalysis> {
  const res = await client.responses
    .parse({
      model: LAYOUT_MODEL,
      instructions: ANALYZE,
      input: [
        {
          role: "user",
          content: [
            { type: "input_image", image_url: image, detail: "high" },
            { type: "input_text", text: "이 슬라이드의 글 배치를 측정해 주세요." },
          ],
        },
      ],
      text: { format: zodTextFormat(SlideSchema, "slide_layout") },
      reasoning: { effort: "low" },
      max_output_tokens: 8000,
      store: false,
    })
    .catch((e) => {
      if (e instanceof OpenAI.APIError) throw e;
      console.error("[layout] 분석 응답 해석 실패", e);
      return null;
    });
  const out = res && res.status !== "incomplete" ? res.output_parsed : null;
  // 한 장 분석이 실패해도 전체를 멈추지 않는다 — 글 없는 장으로 둔다
  return out ?? { background: "#ffffff", photo_share: 100, texts: [] };
}

const RewriteSchema = z.object({
  genre: z.string().describe("이 카드뉴스의 주제 분야 한두 단어 (예: 음식 레시피, 패션, 정치 시사, 경제, 뷰티, 매거진 인터뷰)"),
  commerce: z.boolean().describe("쿠팡 파트너스·광고·협찬·제휴 판매 게시물인지"),
  slides: z.array(
    z.object({
      texts: z.array(
        z.object({
          id: z.string(),
          text: z.string().describe("새 글. 원본과 줄 수가 같고 줄마다 \\n"),
          accent: z.string().describe("원본에 강조 낱말이 있었으면 새 글 안에서 강조할 낱말(새 글에 그대로 들어 있어야 함), 없으면 빈 문자열"),
        }),
      ),
    }),
  ),
  caption: z.string().describe("새 캡션 전체"),
});

const REWRITE = `당신은 인스타그램 카드뉴스 에디터입니다. 주제는 음식·패션·뷰티·정치·시사·경제·매거진·정보 등 무엇이든 될 수 있습니다.
원본 카드뉴스의 디자인(글 상자 위치·크기)은 그대로 쓰고, 각 글 상자에 들어갈 글만 새로 씁니다.

■ 길이·모양 (디자인이 깨지지 않게 가장 중요)
- 상자마다 원본과 **줄 수가 같게**, 줄마다 글자 수는 원본의 80~110% 로 씁니다.
- 역할을 지킵니다: 제목은 제목답게 짧고 강하게, 본문은 본문답게.
- number(번호)·source(출처·날짜)·handle(계정 이름)은 원본 글을 **그대로** 둡니다.

■ 내용
- 같은 정보를 전하되 원본과 확실히 다르게 들리게 고쳐 씁니다. 원본과 6어절 이상 연속으로 같으면 안 됩니다.
- 이름·숫자·날짜·장소·인용문·사건 같은 **사실은 원본 그대로** 씁니다. 원본에 없는 사실·수치·후기를 지어내지 않습니다.
- 정치·시사·경제 글은 원본의 사실관계와 논조를 바꾸거나 과장하지 않습니다. 인용문은 따옴표 안 글자를 바꾸지 않습니다.
- 말투(반말·존댓말·뉴스체·매거진체·구어체)와 분위기는 원본과 같게 맞춥니다. 슬라이드 글의 이모지는 원본에 있을 때만 씁니다.

■ 캡션
- 원본 캡션의 형식(길이·줄바꿈·이모지·해시태그 개수·질문/CTA 유무)을 따라 새로 씁니다. 사실은 원본 그대로.
- 원본 캡션이 없으면 카드뉴스 내용을 2~4문장으로 소개하고 어울리는 해시태그 3~5개를 붙입니다.
- 원본 캡션에 쿠팡 파트너스 같은 고지 문구가 있으면 그 문구는 빼고 씁니다(앱이 따로 붙입니다).

■ 출력
- slides 는 주어진 장 수·순서 그대로, texts 는 주어진 id 를 빠짐없이 그대로 씁니다.`;

/** 데모 모드: AI 없이 화면 흐름 확인용 */
function mockResult(n: number): LayoutResult {
  return {
    genre: "데모",
    commerce: false,
    caption: "[데모] 원본 캡션 형식을 따라 새로 쓴 캡션이에요 ✨\n\n#카드뉴스 #데모",
    slides: Array.from({ length: n }, (_, i) => ({
      original: "",
      ratio: 1.25,
      bg: "#333333",
      photoShare: 100,
      blocks: [
        { ...newBlock(i === 0 ? "title" : "body", i === 0 ? "[데모] 원본 디자인에서\n찾은 제목 자리" : `[데모] ${i + 1}번 장 본문\n끌어서 옮길 수 있어요`,
          { fontId: i === 0 ? "Paperlogy" : "Pretendard", weight: i === 0 ? 800 : 500, size: i === 0 ? 76 : 50, x: 8, y: 66, w: 84, h: 22,
            align: "left", box: false, outline: false, shadow: true }), behind: "#222222" },
        { ...newBlock("handle", "@demo_account", { size: 30, x: 8, y: 92, w: 40, h: 4, align: "left", outline: false }), behind: "#222222" },
      ],
    })),
  };
}

const WEIGHT = { light: 300, regular: 400, bold: 700, black: 900 } as const;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);
const col = (s: string, d: string) => (isHex(s) ? s.toLowerCase() : d);

/** 분석 결과(0~1000 좌표)를 화면용 글 상자(%)로 */
function toBlocks(a: SlideAnalysis, ratio: number): TextBlock[] {
  return a.texts
    .filter((t) => t.text.trim())
    .map((t) => {
      let x0 = clamp(Math.min(t.x0, t.x1), 0, 1000) / 10, x1 = clamp(Math.max(t.x0, t.x1), 0, 1000) / 10;
      let y0 = clamp(Math.min(t.y0, t.y1), 0, 1000) / 10, y1 = clamp(Math.max(t.y0, t.y1), 0, 1000) / 10;
      const color = col(t.color, "#ffffff");
      // 글자 크기: AI가 잰 글자 높이(한글은 글자 크기의 약 88%)와 상자 높이÷줄 수 중 믿을 만한 쪽
      const lines = t.text.split("\n").length;
      const bySize = clamp(t.size_px, 12, 240) / 0.88;
      const byBox = ((y1 - y0) / 100) * SLIDE_W * ratio / (lines * 1.25);
      const size = byBox > bySize * 0.6 && byBox < bySize * 1.5 ? (bySize + byBox) / 2 : bySize;
      const box = t.box && t.box_opacity > 5;
      const pad = box ? Math.round(size * 0.45) : 0;
      // 글이 바뀌면 길이가 조금 달라지므로 상자를 살짝 넉넉하게 (글상자는 여백만큼 더)
      const padX = (pad / SLIDE_W) * 100 + 1.5, padY = (pad / (SLIDE_W * ratio)) * 100 + 1;
      x0 = Math.max(0, x0 - padX); x1 = Math.min(100, x1 + padX);
      y0 = Math.max(0, y0 - padY); y1 = Math.min(100, y1 + padY);
      return {
        ...BASE_STYLE,
        id: blockId(),
        role: t.role as TextRole,
        original: t.text,
        text: t.text,
        accent: t.accent.trim(),
        behind: col(t.behind, "#000000"),
        x: x0,
        y: y0,
        w: Math.max(4, x1 - x0),
        h: Math.max(2, y1 - y0),
        fontId: FONT_STYLES[t.font_style]?.id ?? "Pretendard",
        weight: WEIGHT[t.weight] ?? 400,
        size: Math.round(clamp(size, 14, 280)),
        color,
        align: t.align,
        vAlign: "middle",
        lineHeight: 1.25,
        box,
        boxColor: col(t.box_color, "#000000"),
        boxOpacity: clamp(Math.round(t.box_opacity), 0, 100),
        boxRadius: 0,
        boxBorder: false,
        boxPad: pad,
        outline: t.effect === "outline",
        outlineColor: col(t.effect_color, "#000000"),
        outlineWidth: Math.max(2, Math.round(size / 22)),
        shadow: t.effect === "shadow",
        shadowColor: col(t.effect_color, "#000000"),
        accentColor: col(t.accent_color, color),
      } satisfies TextBlock;
    });
}

/** 슬라이드 비율 (높이÷폭) */
async function imageRatio(dataUrl: string): Promise<number> {
  try {
    const m = await sharp(Buffer.from(dataUrl.split(",")[1] ?? "", "base64")).metadata();
    return clampRatio((m.height ?? 1350) / (m.width ?? 1080));
  } catch {
    return 1.25;
  }
}

export async function remixLayout(req: RemixRequest): Promise<LayoutResult> {
  if (!req.imageUrls?.length && !req.imageDataUrls?.length) {
    throw new LayoutError("원본 디자인을 따라 만들려면 카드뉴스 사진이 필요해요.");
  }
  const images = await toDataUrls(req);
  if (isMockMode()) return mockResult(images.length);
  const client = openai({ timeout: 150_000 });

  // 1단계: 장마다 동시에 배치 측정
  const analyses = await Promise.all(images.map((img) => analyzeSlide(client, img)));
  const ratios = await Promise.all(images.map(imageRatio));
  const blocks = analyses.map((a, i) => toBlocks(a, ratios[i]));

  // 2단계: 새 글
  const listing = blocks
    .map((bs, i) =>
      [`[${i + 1}번 장]`, ...bs.map((b, j) => `- id=s${i + 1}t${j + 1} 역할=${b.role} 줄=${b.original.split("\n").length}${b.accent ? ` 강조="${b.accent}"` : ""}\n${b.original}`)].join("\n"),
    )
    .join("\n\n");
  const content: ResponseInputContent[] = images.map((url) => ({ type: "input_image", image_url: url, detail: "low" }) as const);
  content.push({
    type: "input_text",
    text: [
      `위 카드뉴스 ${images.length}장의 글 상자 목록입니다. 상자마다 새 글을 써 주세요.`,
      `<글_상자>\n${listing}\n</글_상자>`,
      req.caption?.trim() ? `<원본_캡션>\n${req.caption.trim()}\n</원본_캡션>` : "<원본_캡션>없음</원본_캡션>",
    ].join("\n\n"),
  });

  const res = await client.responses
    .parse({
      model: TEXT_MODEL,
      instructions: REWRITE,
      input: [{ role: "user", content }],
      text: { format: zodTextFormat(RewriteSchema, "cardnews_layout_rewrite") },
      reasoning: { effort: "low" },
      max_output_tokens: 12000,
      store: false,
    })
    .catch((e) => {
      if (e instanceof OpenAI.APIError) throw e;
      console.error("[layout] 새 글 응답 해석 실패", e);
      throw new LayoutError("새 글을 만들지 못했어요. 다시 한 번 눌러 주세요.");
    });
  if (res.status === "incomplete") {
    throw new LayoutError(
      res.incomplete_details?.reason === "content_filter"
        ? "이 내용은 AI가 각색을 거절했어요. 다른 게시물로 시도해 주세요."
        : "새 글을 만들지 못했어요. 다시 한 번 눌러 주세요.",
    );
  }
  const out = res.output_parsed;
  if (!out) throw new LayoutError("새 글을 만들지 못했어요. 다시 한 번 눌러 주세요.");

  const byId = new Map(out.slides.flatMap((s) => s.texts).map((t) => [t.id, t]));
  return {
    genre: out.genre,
    commerce: out.commerce,
    caption: out.caption.trim(),
    slides: blocks.map((bs, i) => ({
      original: bs.map((b) => b.original).join("\n\n"),
      ratio: ratios[i],
      bg: col(analyses[i].background, "#ffffff"),
      photoShare: clamp(analyses[i].photo_share, 0, 100),
      blocks: bs.map((b, j) => {
        const keep = b.role === "number" || b.role === "source" || b.role === "handle";
        const nw = byId.get(`s${i + 1}t${j + 1}`);
        const text = keep || !nw?.text.trim() ? b.original : nw.text.trim();
        const accent = nw?.accent && text.includes(nw.accent) ? nw.accent : b.accent && text.includes(b.accent) ? b.accent : "";
        return { ...b, text, accent };
      }),
    })),
  };
}
