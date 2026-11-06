import { NextResponse } from "next/server";
import { fillLayout, type FillRequest } from "@/lib/fill";
import { friendlyError, withApiKey } from "@/lib/openai";
import { requestApiKey, statusOf } from "@/lib/user-key";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let key: string;
  try {
    key = await requestApiKey();
  } catch (e) {
    return NextResponse.json({ error: friendlyError(e) }, { status: statusOf(e, 500) });
  }
  const body = (await req.json().catch(() => null)) as FillRequest | null;
  if (!body || !Array.isArray(body.layouts)) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  try {
    return NextResponse.json(await withApiKey(key, () => fillLayout(body)));
  } catch (e) {
    console.error("[fill]", e);
    return NextResponse.json({ error: friendlyError(e) }, { status: 502 });
  }
}
