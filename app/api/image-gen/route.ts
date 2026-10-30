import { NextResponse } from "next/server";
import { generateSlideImage, isImageGenEnabled, type ImageGenRequest } from "@/lib/image-gen";
import { friendlyError, hasApiKey, isMockMode } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!isImageGenEnabled()) {
    return NextResponse.json({ error: "AI 사진 만들기는 아직 준비 중이에요." }, { status: 403 });
  }
  if (!hasApiKey() && !isMockMode()) {
    return NextResponse.json(
      { error: "AI 키가 설정되지 않았어요. 관리자에게 OPENAI_API_KEY 설정을 요청해 주세요." },
      { status: 500 },
    );
  }
  const body = (await req.json().catch(() => null)) as ImageGenRequest | null;
  try {
    return NextResponse.json({ image: await generateSlideImage(body ?? {}) });
  } catch (e) {
    console.error("[image-gen]", e);
    return NextResponse.json({ error: friendlyError(e) }, { status: 502 });
  }
}
