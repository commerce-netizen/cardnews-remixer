import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { z } from "zod";
import { UserFacingError } from "./errors";
import { fetchCdnImage } from "./instagram";
import { isMockMode, openai, TEXT_MODEL } from "./openai";
import type { RemixRequest, RemixResult } from "./types";

const MAX_IMAGES = 10;

class RemixError extends UserFacingError {}

const ResultSchema = z.object({
  slides: z.array(
    z.object({
      original: z.string().describe("원본 슬라이드에서 읽은 글 그대로"),
      title: z.string().describe("1번 장(표지)만: 정확히 3줄, 줄마다 \\n. 2번 장부터는 빈 문자열"),
      body: z.string().describe("2번 장부터: 정확히 3줄, 줄마다 \\n. 1번 장은 빈 문자열"),
    }),
  ),
  caption: z.string().describe("캡션 본문만. 존댓말 3문장, 문장마다 끝에 이모지 1개. CTA·해시태그·고지 문구 없이"),
});

/*
 * 아래 규칙은 사용자가 준 레퍼런스 레시피 카드뉴스 5세트(20장) + 캡션을 분석해 뽑은 것이다.
 * 핵심: ①슬라이드는 표지·내지 모두 정확히 3줄 ②슬라이드엔 이모지가 하나도 없고 캡션에만 쓴다
 *      ③슬라이드는 반말 구어체, 캡션 본문은 존댓말 '~요'체 ④표지는 [권위]/[메뉴]/[공개 선언] 3단 구조
 */
const SYSTEM = `당신은 레시피 카드뉴스 전문 인스타그램 에디터입니다. (쿠팡 파트너스 제휴)
참고용 원본 카드뉴스를 보고, 같은 정보를 전하되 원본과 확실히 다르게 들리도록 아래 형식에 딱 맞춰 새로 씁니다.

■ 목소리 (가장 중요)
- 슬라이드 글 = 반말 구어체. 친구한테 맛집 자랑하듯, 내가 직접 먹어본 1인칭 체험담.
- 캡션 본문 = 존댓말 '~요'체. 다정하게 알려주는 말투.
- 광고 문구("최고의", "완벽한", "지금 바로")나 설명문투("~입니다", "~할 수 있습니다")는 쓰지 않습니다.

■ 1번 장(표지) — title에만, **정확히 3줄**
구조: ①권위(매출·지역·유명세) ②메뉴 이름 ③공개 선언
- 한 줄 6~14자. 이모지·물결표 금지. 물음표나 느낌표는 마지막 줄에 하나까지.
- 형식 예시(내용은 절대 베끼지 말 것):
  "월 1억 매출 한정식집\\n줄 서서 먹는 소고기 구이\\n비밀 레시피 공개"
  "연매출 10억 반찬가게\\n간장 진미채 맛의 비결\\n양념 비법 공개"
  "신당동 즉석 떡볶이\\n비밀 레시피 유출?\\n맛의 비결은 이거 하나!"
- 원본에 매출·가게 정보가 없으면 지어내지 말고 "줄 서서 먹는", "유명한", "그 맛집" 같은 표현으로 3줄을 채웁니다.

■ 2번 장부터(내지) — body에만, **정확히 3줄**
- 한 줄 12~18자. 3줄이 한 사람의 말처럼 쭉 이어지게 씁니다.
- 어미: ~잖아 / ~없어 / ~더라 / ~더라고 / ~지 / ~네 / ~임 / ~해짐 / ~맛있어 / ~줘
- 말줄임표(...), 느낌표(! ~ !!!), ;;; , ㅠ 를 자연스럽게. 한 장에 1~2개까지만.
- **이모지는 절대 쓰지 않습니다.** (사진 위에 얹히는 글씨라 깨집니다)
- 장별 역할: 2번=첫입 감탄·공감 / 3번=맛·식감·비법 디테일 / 4번 이후=활용·보관·응용 / 마지막 장=마무리
- 형식 예시(내용은 절대 베끼지 말 것):
  "다 필요 없고 갓 지은 흰 쌀밥에\\n한 움큼 올리고 입에 넣으면\\n진짜 밥도둑이 따로 없어..."
  "소고기 구이 아직도 사먹어?\\n집에서 하면 저렴한 가격에\\n일주일 내내 맛있게 배 터짐;;;"
  "양배추를 산더미처럼 주길래\\n먹어봤는데 제발 리필해달라고\\n하게 되더라... 소스가 사기"

■ 마지막 장
3줄 중 **마지막 줄만** 댓글 유도로 끝냅니다. 앞 2줄은 여전히 맛·마무리 이야기입니다.
- 형식 예시: "마무리는 역시 치즈 올린 볶음밥!\\n이 양념장 하나면 며칠 내내 안 질림\\n레시피는 댓글에 '나도' 남겨줘!"

■ caption — 캡션 **본문만**, **정확히 3문장**
- 존댓말 '~요'체. 문장 끝마다 이모지 1개씩(문장당 딱 1개, 서로 다른 이모지).
- 문장1: 어디서 먹던 음식인지 + 집에서도 된다는 공감 후킹
- 문장2: 핵심 조리 포인트 한 가지를 구체적으로 (비법 소스 한 스푼, 불 조절, 재료 손질 등)
- 문장3: 활용도·가치 (다른 재료에도 잘 어울림 / 며칠 먹어도 안 질림 / 알아두면 유용)
- 어울리는 이모지: 😳 ✨ 💗 🤤 😋 🥹 👀 🔥 💛 🫶
- 형식 예시(내용은 절대 베끼지 말 것):
  "한정식집에서 먹던 그 소고기구이, 집에서도 이렇게 만들 수 있어요😳 고기를 노릇하게 볶다가 비법소스 한 스푼 넣어주면 감칠맛이 확 살아나요✨ 소고기부터 돼지고기, 닭고기까지 두루 활용할 수 있어 하나쯤 알아두면 정말 유용해요💗"
- **CTA 문구·해시태그·쿠팡 파트너스 고지는 넣지 마세요.** 앱이 앞뒤에 따로 붙입니다.

■ 각색 원칙
- 원본 문장을 그대로 베끼거나 단어만 바꾸면 안 됩니다. 연속 6어절 이상 원본과 같으면 안 됩니다.
- 음식 이름·재료·조리법·수치 같은 사실은 정확히 유지하고, 없는 효능·후기를 지어내지 않습니다.

■ 출력
- 슬라이드 이미지가 주어지면 이미지 수와 같은 개수, 같은 순서로 slides를 만듭니다. 각 이미지 속 글자를 읽어 original에 적습니다. 글자가 없는 사진이면 original은 빈 문자열로 두고 앞뒤 흐름에 맞는 글을 씁니다.
- 이미지 없이 글만 주어지면 빈 줄이나 "---"로 나뉜 덩어리를 슬라이드 하나로 봅니다. 구분이 없으면 흐름에 맞게 4~6장으로 나눕니다.`;

type MediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function asMediaType(t: string): MediaType {
  return (["image/png", "image/gif", "image/webp"] as const).find((x) => t.startsWith(x)) ?? "image/jpeg";
}

/** 슬라이드 이미지를 data URL 목록으로 (인스타 이미지는 서버가 내려받아 변환) */
async function toDataUrls(req: RemixRequest): Promise<string[]> {
  if (req.imageDataUrls?.length) {
    return req.imageDataUrls.slice(0, MAX_IMAGES).map((d) => {
      if (!/^data:image\/[a-z+]+;base64,/.test(d)) throw new RemixError("이미지 형식이 올바르지 않아요.");
      return d;
    });
  }
  if (req.imageUrls?.length) {
    return Promise.all(
      req.imageUrls.slice(0, MAX_IMAGES).map(async (u) => {
        const { data, type } = await fetchCdnImage(u);
        return `data:${asMediaType(type)};base64,${Buffer.from(data).toString("base64")}`;
      }),
    );
  }
  return [];
}

/** 데모 모드(MOCK_LLM=1): AI 키 없이 화면 흐름을 확인하기 위한 가짜 각색 결과 */
function mockRemix(req: RemixRequest): RemixResult {
  const textBlocks = (req.slideText ?? "").split(/\n\s*\n|^---$/m).map((t) => t.trim()).filter(Boolean);
  const n = Math.min(MAX_IMAGES, Math.max(req.imageDataUrls?.length ?? 0, req.imageUrls?.length ?? 0, textBlocks.length, 1));
  return {
    slides: Array.from({ length: n }, (_, i) => ({
      original: textBlocks[i] ?? "",
      title: i === 0 ? "[데모] 신당동 즉석 떡볶이\n비밀 레시피 유출?\n맛의 비결은 이거 하나!" : "",
      body:
        i === 0
          ? ""
          : i === n - 1
            ? "[데모] 마무리는 역시 볶음밥!\n이 양념장 하나면 안 질림\n레시피는 댓글에 '나도' 남겨줘!"
            : `[데모] ${i + 1}번 장 예시 문장이야\nAI 대신 들어간 글이라\n아래 칸에서 직접 고쳐 보면 돼`,
    })),
    caption:
      "[데모] 맛집에서 먹던 그 맛, 집에서도 그대로 낼 수 있어요😳 " +
      "비법 양념 한 스푼이면 감칠맛이 확 살아나요✨ 하나 알아두면 어디에 써도 잘 어울려요💗",
  };
}

export async function remix(req: RemixRequest): Promise<RemixResult> {
  const slideText = req.slideText?.trim() ?? "";
  const caption = req.caption?.trim() ?? "";
  if (!req.imageUrls?.length && !req.imageDataUrls?.length && !slideText) {
    throw new RemixError("각색할 슬라이드 이미지나 원문 글이 필요해요.");
  }
  if (isMockMode()) return mockRemix(req);
  const images = await toDataUrls(req);

  const content: ResponseInputContent[] = [];
  images.forEach((url, i) => {
    // 카드뉴스 속 작은 한글까지 읽도록 high (gpt-5-mini 입력 단가가 낮아 4장 기준 비용 미미)
    content.push({ type: "input_text", text: `[슬라이드 ${i + 1}]` }, { type: "input_image", image_url: url, detail: "high" });
  });
  const parts = [
    images.length ? `위 슬라이드 이미지 ${images.length}장을 순서대로 각색해 주세요.` : "",
    slideText ? `<원본_슬라이드_글>\n${slideText}\n</원본_슬라이드_글>` : "",
    caption ? `<원본_캡션>\n${caption}\n</원본_캡션>` : "<원본_캡션>없음</원본_캡션>",
  ];
  content.push({ type: "input_text", text: parts.filter(Boolean).join("\n\n") });

  const response = await openai().responses.parse({
    model: TEXT_MODEL,
    instructions: SYSTEM,
    input: [{ role: "user", content }],
    text: { format: zodTextFormat(ResultSchema, "cardnews_remix") },
    // 저비용: 생각은 짧게, 출력 길이 상한 (추론 토큰 포함)
    reasoning: { effort: "low" },
    max_output_tokens: 8000,
    store: false,
  }).catch((e) => {
    if (e instanceof OpenAI.APIError) throw e;
    // 응답이 잘렸거나 JSON이 깨진 경우
    console.error("[remix] 응답 해석 실패", e);
    throw new RemixError("각색 결과를 만들지 못했어요. 다시 한 번 눌러 주세요.");
  });

  if (response.status === "incomplete") {
    console.error("[remix] 응답 미완료", response.incomplete_details);
    throw new RemixError(
      response.incomplete_details?.reason === "content_filter"
        ? "이 내용은 AI가 각색을 거절했어요. 다른 게시물로 시도해 주세요."
        : "각색 결과를 만들지 못했어요. 다시 한 번 눌러 주세요.",
    );
  }
  const refused = response.output.some(
    (o) => o.type === "message" && o.content.some((c) => c.type === "refusal"),
  );
  if (refused) {
    throw new RemixError("이 내용은 AI가 각색을 거절했어요. 다른 게시물로 시도해 주세요.");
  }
  const out = response.output_parsed;
  if (!out || !out.slides.length) {
    throw new RemixError("각색 결과를 만들지 못했어요. 다시 한 번 눌러 주세요.");
  }
  // CTA와 고지 문구는 화면에서 템플릿 설정대로 붙인다 (lib/caption.ts)
  return { slides: out.slides, caption: out.caption.trim() };
}
