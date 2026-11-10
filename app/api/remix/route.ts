import { NextResponse } from "next/server";
import { errorStatus, friendlyError, withApiKey } from "@/lib/openai";
import { remix } from "@/lib/remix";
import { requestApiKey, statusOf } from "@/lib/user-key";
import type { RemixRequest } from "@/lib/types";

export const runtime = "nodejs";
// 이미지 여러 장을 읽고 쓰는 데 시간이 걸릴 수 있음 (Vercel 함수 최대 실행 시간)
export const maxDuration = 120;

export async function POST(req: Request) {
  let key: string;
  try {
    key = await requestApiKey();
  } catch (e) {
    return NextResponse.json({ error: friendlyError(e) }, { status: statusOf(e, 500) });
  }
  const body = (await req.json().catch(() => null)) as RemixRequest | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });

  try {
    return NextResponse.json(await withApiKey(key, () => remix(body)));
  } catch (e) {
    console.error("[remix]", e);
    return NextResponse.json({ error: friendlyError(e) }, { status: errorStatus(e) });
  }
}
