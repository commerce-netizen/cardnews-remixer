import { NextResponse } from "next/server";
import { remixLayout } from "@/lib/layout-ai";
import { friendlyError, hasApiKey, isMockMode } from "@/lib/openai";
import type { RemixRequest } from "@/lib/types";

export const runtime = "nodejs";
// 장마다 글 배치를 읽고(동시에) 새 글을 쓰는 데 1~2분 걸릴 수 있음
export const maxDuration = 240;

export async function POST(req: Request) {
  if (!hasApiKey() && !isMockMode()) {
    return NextResponse.json(
      { error: "AI 키가 설정되지 않았어요. 관리자에게 OPENAI_API_KEY 설정을 요청해 주세요." },
      { status: 500 },
    );
  }
  const body = (await req.json().catch(() => null)) as RemixRequest | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  try {
    return NextResponse.json(await remixLayout(body));
  } catch (e) {
    console.error("[layout]", e);
    return NextResponse.json({ error: friendlyError(e) }, { status: 502 });
  }
}
