import { NextResponse } from "next/server";
import { friendlyError, hasApiKey, isMockMode } from "@/lib/openai";
import { remix } from "@/lib/remix";
import type { RemixRequest } from "@/lib/types";

export const runtime = "nodejs";
// 이미지 여러 장을 읽고 쓰는 데 시간이 걸릴 수 있음 (Vercel 함수 최대 실행 시간)
export const maxDuration = 120;

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
    return NextResponse.json(await remix(body));
  } catch (e) {
    console.error("[remix]", e);
    return NextResponse.json({ error: friendlyError(e) }, { status: 502 });
  }
}
