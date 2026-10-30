import { fetchCdnImage, isInstagramCdn } from "@/lib/instagram";

export const runtime = "nodejs";

/** 인스타 CDN 이미지를 같은 출처로 내려줘서 미리보기·PNG 저장 시 CORS 문제를 피함 */
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!isInstagramCdn(url)) return new Response("허용되지 않은 주소", { status: 400 });
  try {
    const { data, type } = await fetchCdnImage(url);
    return new Response(data, {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return new Response("이미지를 가져오지 못했어요", { status: 502 });
  }
}
