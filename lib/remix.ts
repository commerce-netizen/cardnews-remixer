import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { fetchCdnImage } from "./instagram";
import type { RemixRequest, RemixResult } from "./types";

export const DISCLOSURE =
  "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

const MAX_IMAGES = 10;

/** 사용자에게 그대로 보여줄 수 있는 한글 오류 */
export class RemixError extends Error {}

const ResultSchema = z.object({
  slides: z.array(
    z.object({
      original: z.string().describe("원본 슬라이드에서 읽은 글 그대로"),
      title: z.string().describe("각색한 큰 제목 (짧게, 20자 안팎)"),
      body: z.string().describe("각색한 본문 (2~4줄, 없으면 빈 문자열)"),
    }),
  ),
  caption: z.string().describe("각색한 인스타그램 캡션 (해시태그 포함)"),
});

const SYSTEM = `당신은 쿠팡 파트너스 제휴 마케터를 돕는 인스타그램 카드뉴스 에디터입니다.
사용자가 참고용 원본 카드뉴스(슬라이드 이미지, 슬라이드 글, 캡션)를 주면, 같은 정보를 전하되 원본과 확실히 다르게 들리도록 새로 써 주세요.

각색 원칙:
- 어미를 바꿉니다. (예: "~합니다" ↔ "~해요", "~하세요" ↔ "~해 보세요", 명사형 마무리 등)
- 톤앤매너를 바꿉니다. 원본이 딱딱하면 친근하게, 과장되면 담백하게 — 원본과 다른 목소리로.
- 문장 구조를 바꿉니다. 순서를 뒤집거나, 질문형↔서술형, 나열↔이야기식으로 재구성합니다.
- 원본 문장을 그대로 베끼거나 단어만 바꾼 수준이면 안 됩니다. 연속 6어절 이상 원본과 같으면 안 됩니다.
- 제품명, 수치, 가격, 사용법 같은 사실 정보는 정확히 유지하고, 없는 효능·후기를 지어내지 않습니다.
- 카드뉴스는 한눈에 읽혀야 합니다. 제목은 짧고 강하게, 본문은 쉬운 말로 짧게 씁니다.
- 첫 장은 손이 멈추는 후킹 제목으로, 마지막 장은 자연스러운 행동 유도(저장, 프로필 링크 확인 등)로 마무리합니다.

출력 규칙:
- 슬라이드 이미지가 주어지면 이미지 수와 같은 개수, 같은 순서로 slides를 만듭니다. 각 이미지 안의 글자를 읽어 original에 적습니다. 글자가 없는 사진이면 original은 빈 문자열로 두고 앞뒤 흐름에 맞는 짧은 글을 씁니다.
- 이미지 없이 글만 주어지면 빈 줄이나 "---"로 나뉜 덩어리를 슬라이드 하나로 봅니다. 구분이 없으면 내용 흐름에 맞게 4~8장으로 나눕니다.
- caption은 원본 캡션을 같은 원칙으로 각색하고, 관련 해시태그 5~10개를 끝에 붙입니다. 원본 캡션이 없으면 슬라이드 내용으로 새로 씁니다.
- 쿠팡 파트너스 고지 문구는 따로 붙이니 caption에 넣지 마세요.`;

type ImageBlock = Anthropic.ImageBlockParam;
type MediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function asMediaType(t: string): MediaType {
  return (["image/png", "image/gif", "image/webp"] as const).find((x) => t.startsWith(x)) ?? "image/jpeg";
}

async function toImageBlocks(req: RemixRequest): Promise<ImageBlock[]> {
  if (req.imageDataUrls?.length) {
    return req.imageDataUrls.slice(0, MAX_IMAGES).map((d) => {
      const m = d.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
      if (!m) throw new RemixError("이미지 형식이 올바르지 않아요.");
      return {
        type: "image",
        source: { type: "base64", media_type: asMediaType(m[1]), data: m[2] },
      };
    });
  }
  if (req.imageUrls?.length) {
    return Promise.all(
      req.imageUrls.slice(0, MAX_IMAGES).map(async (u) => {
        const { data, type } = await fetchCdnImage(u);
        return {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: asMediaType(type),
            data: Buffer.from(data).toString("base64"),
          },
        };
      }),
    );
  }
  return [];
}

export const isMockMode = () => process.env.MOCK_LLM === "1";

/** 데모 모드(MOCK_LLM=1): AI 키 없이 화면 흐름을 확인하기 위한 가짜 각색 결과 */
function mockRemix(req: RemixRequest): RemixResult {
  const textBlocks = (req.slideText ?? "").split(/\n\s*\n|^---$/m).map((t) => t.trim()).filter(Boolean);
  const n = Math.min(MAX_IMAGES, Math.max(req.imageDataUrls?.length ?? 0, req.imageUrls?.length ?? 0, textBlocks.length, 1));
  return {
    slides: Array.from({ length: n }, (_, i) => ({
      original: textBlocks[i] ?? "",
      title: i === 0 ? "[데모] 이거 하나면\n고민 끝이에요" : i === n - 1 ? "[데모] 잊기 전에 저장!" : `[데모] ${i + 1}번째 포인트`,
      body: i === n - 1 ? "자세한 정보는 프로필 링크에서 확인해 보세요." : "데모 모드라 AI 대신 예시 문장이 들어갔어요. 직접 고쳐 보세요.",
    })),
    caption: `[데모] 오늘의 추천템을 소개할게요!\n\n#데모 #추천템\n\n${DISCLOSURE}`,
  };
}

export async function remix(req: RemixRequest): Promise<RemixResult> {
  const slideText = req.slideText?.trim() ?? "";
  const caption = req.caption?.trim() ?? "";
  if (!req.imageUrls?.length && !req.imageDataUrls?.length && !slideText) {
    throw new RemixError("각색할 슬라이드 이미지나 원문 글이 필요해요.");
  }
  if (isMockMode()) return mockRemix(req);
  const images = await toImageBlocks(req);

  const content: Anthropic.ContentBlockParam[] = [];
  images.forEach((img, i) => {
    content.push({ type: "text", text: `[슬라이드 ${i + 1}]` }, img);
  });
  const parts = [
    images.length ? `위 슬라이드 이미지 ${images.length}장을 순서대로 각색해 주세요.` : "",
    slideText ? `<원본_슬라이드_글>\n${slideText}\n</원본_슬라이드_글>` : "",
    caption ? `<원본_캡션>\n${caption}\n</원본_캡션>` : "<원본_캡션>없음</원본_캡션>",
  ];
  content.push({ type: "text", text: parts.filter(Boolean).join("\n\n") });

  const client = new Anthropic();
  const response = await client.messages
    .parse({
      model: process.env.LLM_MODEL || "claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: "medium", format: zodOutputFormat(ResultSchema) },
      messages: [{ role: "user", content }],
    })
    .catch((e) => {
      if (e instanceof Anthropic.APIError) throw e;
      // 응답이 잘렸거나(max_tokens) JSON이 깨진 경우
      console.error("[remix] 응답 해석 실패", e);
      throw new RemixError("각색 결과를 만들지 못했어요. 다시 한 번 눌러 주세요.");
    });

  if (response.stop_reason === "refusal") {
    throw new RemixError("이 내용은 AI가 각색을 거절했어요. 다른 게시물로 시도해 주세요.");
  }
  const out = response.parsed_output;
  if (!out || !out.slides.length) {
    throw new RemixError("각색 결과를 만들지 못했어요. 다시 한 번 눌러 주세요.");
  }
  return {
    slides: out.slides,
    caption: `${out.caption.trim()}\n\n${DISCLOSURE}`,
  };
}
