import { NextResponse } from "next/server";
import { hotRawUrl } from "@/lib/hot";

export const runtime = "nodejs";

export async function GET() {
  try {
    const res = await fetch(hotRawUrl("hot.json"), { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(String(res.status));
    return NextResponse.json(await res.json(), {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json(
      { error: "인기 게시물을 아직 못 불러왔어요. 잠시 뒤 다시 열어 주세요." },
      { status: 503 },
    );
  }
}
