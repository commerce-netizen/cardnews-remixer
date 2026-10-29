import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ExtractError } from "@/lib/instagram";
import { isMockMode, remix, RemixError } from "@/lib/remix";
import type { RemixRequest } from "@/lib/types";

export const runtime = "nodejs";
// 이미지 여러 장을 읽고 쓰는 데 시간이 걸릴 수 있음 (Vercel 함수 최대 실행 시간)
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !isMockMode()) {
    return NextResponse.json(
      { error: "AI 키가 설정되지 않았어요. 관리자에게 ANTHROPIC_API_KEY 설정을 요청해 주세요." },
      { status: 500 },
    );
  }
  const body = (await req.json().catch(() => null)) as RemixRequest | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });

  try {
    return NextResponse.json(await remix(body));
  } catch (e) {
    console.error("[remix]", e);
    let message = "각색 중 문제가 생겼어요. 잠시 뒤 다시 눌러 주세요.";
    if (e instanceof RemixError || e instanceof ExtractError) {
      message = e.message;
    } else if (e instanceof Anthropic.RateLimitError) {
      message = "지금 사용하는 사람이 많아요. 1분 뒤에 다시 눌러 주세요.";
    } else if (e instanceof Anthropic.AuthenticationError) {
      message = "AI 키가 올바르지 않아요. 관리자에게 알려 주세요.";
    } else if (e instanceof Anthropic.APIError) {
      message = "AI 서버와 연결이 잠깐 끊겼어요. 잠시 뒤 다시 눌러 주세요.";
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
