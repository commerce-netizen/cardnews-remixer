import { hotRawUrl } from "@/lib/hot";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{5,40}$/.test(code)) return new Response("bad code", { status: 400 });
  const res = await fetch(hotRawUrl(`thumbs/${code}.webp`), { next: { revalidate: 86400 } });
  if (!res.ok) return new Response("not found", { status: 404 });
  return new Response(await res.arrayBuffer(), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}
