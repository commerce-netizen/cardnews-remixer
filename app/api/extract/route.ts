import { NextResponse } from "next/server";
import { extractInstagram, ExtractError } from "@/lib/instagram";

export const runtime = "nodejs";
// 인스타가 막으면 렌더링 프록시로 다시 받는데 10~30초 걸릴 수 있다
export const maxDuration = 90;

export async function POST(req: Request) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url?.trim()) {
    return NextResponse.json({ error: "인스타그램 게시물 주소를 넣어 주세요." }, { status: 400 });
  }
  try {
    return NextResponse.json(await extractInstagram(url));
  } catch (e) {
    const message =
      e instanceof ExtractError ? e.message : "게시물을 가져오는 중 문제가 생겼어요.";
    if (!(e instanceof ExtractError)) console.error("[extract]", e);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
