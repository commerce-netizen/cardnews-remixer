import { NextResponse } from "next/server";
import { isImageGenEnabled, remakeSlideImage, type ImageGenRequest } from "@/lib/image-gen";
import { friendlyError, hasApiKey, isMockMode } from "@/lib/openai";

export const runtime = "nodejs";
// 새 사진 만들기는 1~2분 걸릴 수 있음
export const maxDuration = 240;

export async function POST(req: Request) {
  if (!isImageGenEnabled()) {
    return NextResponse.json({ error: "AI 새 사진 기능이 꺼져 있어요." }, { status: 403 });
  }
  if (!hasApiKey() && !isMockMode()) {
    return NextResponse.json(
      { error: "AI 키가 설정되지 않았어요. 관리자에게 OPENAI_API_KEY 설정을 요청해 주세요." },
      { status: 500 },
    );
  }
  const body = (await req.json().catch(() => null)) as ImageGenRequest | null;
  try {
    return NextResponse.json({ image: await remakeSlideImage(body ?? {}) });
  } catch (e) {
    console.error("[image-gen]", e);
    return NextResponse.json({ error: friendlyError(e) }, { status: 502 });
  }
}
