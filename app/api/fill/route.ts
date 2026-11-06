import { NextResponse } from "next/server";
import { fillLayout, type FillRequest } from "@/lib/fill";
import { friendlyError, hasApiKey, isMockMode } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!hasApiKey() && !isMockMode()) {
    return NextResponse.json(
      { error: "AI 키가 설정되지 않았어요. 관리자에게 OPENAI_API_KEY 설정을 요청해 주세요." },
      { status: 500 },
    );
  }
  const body = (await req.json().catch(() => null)) as FillRequest | null;
  if (!body || !Array.isArray(body.layouts)) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  try {
    return NextResponse.json(await fillLayout(body));
  } catch (e) {
    console.error("[fill]", e);
    return NextResponse.json({ error: friendlyError(e) }, { status: 502 });
  }
}
