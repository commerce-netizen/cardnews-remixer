import { NextResponse } from "next/server";
import { isImageGenEnabled, remakeSlideImage, type ImageGenRequest } from "@/lib/image-gen";
import { errorStatus, friendlyError, withApiKey } from "@/lib/openai";
import { requestApiKey, statusOf } from "@/lib/user-key";

export const runtime = "nodejs";
// 새 사진 만들기는 1~2분 걸릴 수 있음
export const maxDuration = 240;

export async function POST(req: Request) {
  if (!isImageGenEnabled()) {
    return NextResponse.json({ error: "AI 새 사진 기능이 꺼져 있어요." }, { status: 403 });
  }
  let key: string;
  try {
    key = await requestApiKey();
  } catch (e) {
    return NextResponse.json({ error: friendlyError(e) }, { status: statusOf(e, 500) });
  }
  const body = (await req.json().catch(() => null)) as ImageGenRequest | null;
  try {
    return NextResponse.json({ image: await withApiKey(key, () => remakeSlideImage(body ?? {})) });
  } catch (e) {
    console.error("[image-gen]", e);
    return NextResponse.json({ error: friendlyError(e) }, { status: errorStatus(e) });
  }
}
