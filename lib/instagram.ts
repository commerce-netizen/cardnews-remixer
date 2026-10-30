import https from "node:https";
import zlib from "node:zlib";
import { UserFacingError } from "./errors";
import type { ExtractResult } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IG_APP_ID = "936619743392459";
const DEFAULT_DOC_ID = "8845758582119845";

export class ExtractError extends UserFacingError {}

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

/**
 * 실제 크롬이 보내는 헤더 세트.
 *
 * 이게 핵심이다 — UA만 바꿔 보내면 인스타가 **데이터 없는 껍데기 HTML**(500KB 넘는 JS 번들)을 준다.
 * 브라우저처럼 Accept / Sec-Fetch-* / sec-ch-ua / Referer 까지 갖춰 보내야 데이터가 든 진짜 페이지가 온다.
 * 임베드는 iframe 안에서 열리는 페이지라 Sec-Fetch-Dest: iframe 이 특히 중요하다. (실측 확인)
 */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "Upgrade-Insecure-Requests": "1",
  "sec-ch-ua": '"Chromium";v="130", "Not?A_Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
};

const EMBED_HEADERS: Record<string, string> = {
  ...BROWSER_HEADERS,
  "Sec-Fetch-Dest": "iframe",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "cross-site",
  Referer: "https://www.google.com/",
};

/**
 * 페이지 받아오기 — **fetch 를 쓰지 않는다.**
 *
 * fetch(undici)는 스펙대로 `Sec-Fetch-Mode` 를 항상 `cors` 로 덮어쓴다. 그런데 인스타는
 * 이 값이 `navigate` 가 아니면 데이터 없는 껍데기 HTML을 돌려준다. (실측: fetch=껍데기 / node:https=데이터 있음)
 * 그래서 헤더를 그대로 보낼 수 있는 node:https 로 직접 요청한다.
 */
function rawGet(
  url: string,
  headers: Record<string, string>,
  redirectsLeft = 3,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        host: u.hostname,
        path: u.pathname + u.search,
        method: "GET",
        headers: { ...headers, "Accept-Encoding": "gzip, deflate" },
      },
      (res) => {
        const loc = res.headers.location;
        if (loc && res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          if (redirectsLeft <= 0) return resolve({ status: res.statusCode, body: "" });
          return rawGet(new URL(loc, url).toString(), headers, redirectsLeft - 1).then(resolve, reject);
        }
        const enc = res.headers["content-encoding"];
        const stream =
          enc === "gzip" ? res.pipe(zlib.createGunzip()) : enc === "deflate" ? res.pipe(zlib.createInflate()) : res;
        const chunks: Buffer[] = [];
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
        stream.on("error", reject);
      },
    );
    req.on("error", reject);
    req.setTimeout(15_000, () => req.destroy(new Error("instagram timeout")));
    req.end();
  });
}

async function get(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...BROWSER_HEADERS, ...init?.headers },
    signal: AbortSignal.timeout(15_000),
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

/** 임베드 페이지 HTML에서 게시물 데이터 뽑기 (직접 요청·프록시가 함께 쓴다) */
function parseEmbedHtml(html: string): ExtractResult | null {
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

/** 방법 2: 공개 임베드 페이지 직접 요청 */
async function viaEmbed(code: string): Promise<ExtractResult | null> {
  const res = await rawGet(`https://www.instagram.com/p/${code}/embed/captioned/`, EMBED_HEADERS);
  if (res.status !== 200) return null;
  return parseEmbedHtml(res.body);
}

/**
 * 방법 3: r.jina.ai 로 임베드 페이지를 **브라우저처럼 렌더링해서** 가져온다.
 *
 * 인스타는 서버(특히 클라우드 IP)에서 바로 받으면 데이터 없는 껍데기 HTML만 돌려준다.
 * r.jina.ai 는 자기들 브라우저로 열어 렌더링된 HTML을 주기 때문에, 그 안에 들어 있는
 * contextJSON(= GraphQL 원본 데이터)을 그대로 읽을 수 있다 → 캐러셀 전체 + 캡션 전문.
 * 느리니(10~30초) 직접 요청이 실패했을 때만 쓴다.
 * 주의: 키 없이 쓰면 다른 사용자의 남용 때문에 도메인 단위로 몇 시간씩 막힐 수 있다(403 AbuseAlleviationError).
 * JINA_API_KEY 를 넣으면 익명이 아니게 되어 그 차단을 피하고 한도도 넉넉해진다.
 */
async function viaJinaEmbed(code: string): Promise<ExtractResult | null> {
  const key = process.env.JINA_API_KEY;
  const res = await fetch(`https://r.jina.ai/https://www.instagram.com/p/${code}/embed/captioned/`, {
    headers: {
      "x-respond-with": "html",
      "x-no-cache": "true",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    signal: AbortSignal.timeout(50_000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return parseEmbedHtml(await res.text());
}

/** 방법 3: 게시물 페이지의 og 태그 (첫 장 이미지 + 캡션 일부만) */
async function viaOgTags(code: string): Promise<ExtractResult | null> {
  const res = await rawGet(`https://www.instagram.com/p/${code}/`, {
    ...BROWSER_HEADERS,
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
  });
  if (res.status !== 200) return null;
  const html = res.body;
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

  // 임베드가 가장 잘 된다(캐러셀 전체+캡션 전문). 그다음 GraphQL, 막히면 렌더링 프록시, 마지막이 og(1장뿐)
  for (const method of [viaEmbed, viaGraphql, viaJinaEmbed, viaOgTags]) {
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
  // 캐러셀 전체를 못 가져왔더라도 1장이라도 있으면 그걸로 진행한다
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
