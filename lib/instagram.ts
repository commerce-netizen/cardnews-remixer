import type { ExtractResult } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IG_APP_ID = "936619743392459";
const DEFAULT_DOC_ID = "8845758582119845";

/** 사용자에게 그대로 보여줄 수 있는 한글 오류 */
export class ExtractError extends Error {}

export function parseShortcode(input: string): string {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new ExtractError("주소 모양이 올바르지 않아요. 인스타그램 게시물 주소를 그대로 붙여 넣어 주세요.");
  }
  if (!/(^|\.)instagram\.com$/.test(url.hostname) && url.hostname !== "instagr.am") {
    throw new ExtractError("인스타그램 주소만 넣을 수 있어요. (instagram.com 으로 시작하는 주소)");
  }
  const m = url.pathname.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  if (!m) {
    throw new ExtractError("게시물 주소가 아니에요. 게시물의 '링크 복사'로 얻은 주소를 넣어 주세요.");
  }
  return m[1];
}

type Media = {
  display_url?: string;
  display_resources?: { src: string; config_width: number }[];
  image_versions2?: { candidates: { url: string; width: number }[] };
  edge_sidecar_to_children?: { edges: { node: Media }[] };
  carousel_media?: Media[];
  edge_media_to_caption?: { edges: { node: { text: string } }[] };
  caption?: { text?: string } | null;
};

function bestImage(m: Media): string | undefined {
  if (m.display_resources?.length) {
    return [...m.display_resources].sort((a, b) => b.config_width - a.config_width)[0].src;
  }
  if (m.image_versions2?.candidates?.length) {
    return [...m.image_versions2.candidates].sort((a, b) => b.width - a.width)[0].url;
  }
  return m.display_url;
}

function fromMedia(m: Media): ExtractResult {
  const children: Media[] =
    m.edge_sidecar_to_children?.edges.map((e) => e.node) ?? m.carousel_media ?? [m];
  const imageUrls = children.map(bestImage).filter((u): u is string => !!u);
  const caption = m.edge_media_to_caption?.edges[0]?.node.text ?? m.caption?.text ?? "";
  return { imageUrls, caption };
}

async function get(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9", ...init?.headers },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
}

/** 방법 1: 인스타 웹이 쓰는 GraphQL (가장 정확, 캐러셀 전체) */
async function viaGraphql(code: string): Promise<ExtractResult | null> {
  const body = new URLSearchParams({
    variables: JSON.stringify({
      shortcode: code,
      fetch_tagged_user_count: null,
      hoisted_comment_id: null,
      hoisted_reply_id: null,
    }),
    doc_id: process.env.IG_DOC_ID || DEFAULT_DOC_ID,
  });
  const res = await get("https://www.instagram.com/graphql/query", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-IG-App-ID": IG_APP_ID,
      "X-FB-LSD": "AVqbxe3J_YA",
      "X-ASBD-ID": "129477",
      "Sec-Fetch-Site": "same-origin",
    },
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const media: Media | undefined =
    json?.data?.xdt_shortcode_media ?? json?.data?.shortcode_media;
  return media ? fromMedia(media) : null;
}

/** 방법 2: 공개 임베드 페이지 (로그인 없이 열리는 경우가 많음) */
async function viaEmbed(code: string): Promise<ExtractResult | null> {
  const res = await get(`https://www.instagram.com/p/${code}/embed/captioned/`);
  if (!res.ok) return null;
  const html = await res.text();

  // 임베드 페이지 안의 "contextJSON":"{...}" (문자열로 감싼 JSON)에서 게시물 데이터 찾기
  const ctx = readJsonStringAfter(html, '"contextJSON":');
  if (ctx) {
    try {
      const gql = JSON.parse(ctx)?.gql_data;
      const media: Media | undefined = gql?.shortcode_media ?? gql?.xdt_shortcode_media;
      if (media) {
        const r = fromMedia(media);
        if (r.imageUrls.length) return r;
      }
    } catch {
      // 아래 HTML 파싱으로 진행
    }
  }

  const imgs = [...html.matchAll(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/g)].map((m) =>
    decodeHtml(m[1]),
  );
  const capMatch = html.match(/<div class="Caption">([\s\S]*?)<div class="CaptionComments">/);
  const caption = capMatch
    ? decodeHtml(
        capMatch[1]
          .replace(/<br\s*\/?>/g, "\n")
          .replace(/<a class="CaptionUsername"[\s\S]*?<\/a>/, "")
          .replace(/<[^>]+>/g, ""),
      ).trim()
    : "";
  return imgs.length || caption ? { imageUrls: imgs, caption } : null;
}

/** 방법 3: 게시물 페이지의 og 태그 (첫 장 이미지 + 캡션 일부만) */
async function viaOgTags(code: string): Promise<ExtractResult | null> {
  const res = await get(`https://www.instagram.com/p/${code}/`);
  if (!res.ok) return null;
  const html = await res.text();
  const og = (p: string) =>
    html.match(new RegExp(`<meta property="og:${p}" content="([^"]*)"`))?.[1];
  const image = og("image");
  let caption = decodeHtml(og("description") ?? "");
  // "좋아요 12개, 댓글 3개 - user님: "캡션"" 형태에서 캡션만
  const quoted = caption.match(/[:：]\s*"([\s\S]*)"\s*\.?$/);
  if (quoted) caption = quoted[1];
  return image ? { imageUrls: [decodeHtml(image)], caption } : null;
}

/** html에서 marker 바로 뒤에 오는 JSON 문자열 리터럴을 읽어 디코드 */
function readJsonStringAfter(html: string, marker: string): string | null {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf('"', at + marker.length);
  if (start < 0) return null;
  let i = start + 1;
  while (i < html.length) {
    if (html[i] === "\\") i += 2;
    else if (html[i] === '"') break;
    else i++;
  }
  try {
    return JSON.parse(html.slice(start, i + 1));
  } catch {
    return null;
  }
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

export async function extractInstagram(input: string): Promise<ExtractResult> {
  const code = parseShortcode(input);
  let partial = null as ExtractResult | null;

  for (const method of [viaGraphql, viaEmbed, viaOgTags]) {
    try {
      const r = await method(code);
      if (!r) continue;
      // 이미지 여러 장 + 캡션이면 충분. 아니면 다음 방법도 시도해서 더 나은 결과 사용
      if (r.imageUrls.length > 1 && r.caption) return r;
      if (!partial || r.imageUrls.length > partial.imageUrls.length) {
        partial = { imageUrls: r.imageUrls, caption: r.caption || partial?.caption || "" };
      } else if (!partial.caption && r.caption) {
        partial.caption = r.caption;
      }
    } catch (e) {
      console.warn(`[extract] ${method.name} 실패`, e);
    }
  }

  if (!partial || !partial.imageUrls.length) {
    throw new ExtractError(
      "인스타그램에서 게시물을 가져오지 못했어요. 비공개 게시물이거나 인스타그램이 막고 있을 수 있어요.",
    );
  }
  return partial;
}

/** 이미지 프록시/서버 다운로드 허용 호스트 (SSRF 방지) */
export function isInstagramCdn(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname.endsWith(".cdninstagram.com") || u.hostname.endsWith(".fbcdn.net"))
    );
  } catch {
    return false;
  }
}

export async function fetchCdnImage(url: string): Promise<{ data: ArrayBuffer; type: string }> {
  if (!isInstagramCdn(url)) throw new ExtractError("허용되지 않은 이미지 주소예요.");
  const res = await get(url, { headers: { Referer: "https://www.instagram.com/" } });
  if (!res.ok) throw new ExtractError("이미지를 내려받지 못했어요.");
  const type = res.headers.get("content-type") ?? "image/jpeg";
  if (!type.startsWith("image/")) throw new ExtractError("이미지가 아니에요.");
  return { data: await res.arrayBuffer(), type };
}
