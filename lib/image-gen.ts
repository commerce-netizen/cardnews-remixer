import { UserFacingError } from "./errors";
import { IMAGE_MODEL, isMockMode, openai } from "./openai";

/** 2단계 기능: 슬라이드 배경 사진 AI 생성. 기본은 꺼짐 (NEXT_PUBLIC_ENABLE_IMAGE_GEN=1 일 때만) */
export const isImageGenEnabled = () => process.env.NEXT_PUBLIC_ENABLE_IMAGE_GEN === "1";

type Quality = "low" | "medium" | "high";
// 저비용 기본값 low (gpt-image-1-mini 1024x1536 기준 장당 약 $0.006)
const QUALITY: Quality = (["low", "medium", "high"] as const).find((q) => q === process.env.OPENAI_IMAGE_QUALITY) ?? "low";

export type ImageGenRequest = { title?: string; body?: string };

/** 슬라이드 글에 어울리는 배경 사진을 만들어 data URL로 돌려준다. 글씨는 앱이 위에 얹으므로 사진엔 글자를 넣지 않는다. */
export async function generateSlideImage({ title = "", body = "" }: ImageGenRequest): Promise<string> {
  const topic = `${title}\n${body}`.trim();
  if (!topic) throw new UserFacingError("사진을 만들려면 먼저 제목이나 설명 글을 적어 주세요.");
  if (isMockMode()) return mockImage(title);

  const prompt = [
    "인스타그램 카드뉴스 슬라이드에 쓸 세로형 배경 사진.",
    "깔끔하고 밝은 생활 사진 스타일, 제품이나 상황이 자연스럽게 보이게.",
    "사진 안에 글자, 숫자, 로고, 워터마크, 브랜드명은 절대 넣지 말 것.",
    `슬라이드 내용: ${topic.slice(0, 300)}`,
  ].join("\n");

  const res = await openai().images.generate({
    model: IMAGE_MODEL,
    prompt,
    n: 1,
    size: "1024x1536",
    quality: QUALITY,
    output_format: "jpeg",
    output_compression: 80,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new UserFacingError("사진을 만들지 못했어요. 다시 한 번 눌러 주세요.");
  return `data:image/jpeg;base64,${b64}`;
}

function mockImage(title: string): string {
  const label = (title || "데모").replace(/[<>&"]/g, "").slice(0, 12);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ec5ff"/><stop offset="1" stop-color="#ffd6a5"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="50%" font-size="64" text-anchor="middle" fill="#ffffff" opacity="0.8">[데모 사진] ${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
