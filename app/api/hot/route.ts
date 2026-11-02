import { NextResponse } from "next/server";
import { hotRawUrl } from "@/lib/hot";

export const runtime = "nodejs";
// 서버 데이터 캐시에 묶이지 않게 매 요청 새로 받되, 응답은 CDN 이 10분 캐시한다
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // raw.githubusercontent 의 엣지 캐시도 10분 단위로 깨서 매일 수집 결과가 바로 보이게 한다
    const bucket = Math.floor(Date.now() / 600_000);
    const res = await fetch(`${hotRawUrl("hot.json")}?v=${bucket}`, { cache: "no-store" });
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
