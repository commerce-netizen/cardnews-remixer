// 인기 카드뉴스 탭 데이터 수집기 (매일 GitHub Actions 에서 실행)
//
// 1) scripts/hot/accounts.json 의 계정들의 최근 게시물을 브라이트데이터(Instagram Posts 데이터셋,
//    '계정 주소로 찾기' 모드)로 받는다. 좋아요·댓글 수가 들어 있다.
//    - 이미 모아 둔 계정: 최근 15개만 (최근 게시물 수치 갱신)
//    - 처음 보는 계정: 최근 100개 (역대 인기글 계산용 1회 수집)
// 2) 지금까지 모은 게시물(posts.json)에 합친다 — 같은 게시물은 최신 수치로 덮어쓴다.
// 3) 일일/주간/월간/역대 인기 목록을 계산해 hot.json 으로 쓰고, 목록에 든 게시물 썸네일만 내려받아 둔다.
//    (인스타 이미지 주소는 며칠 뒤 만료되므로 썸네일은 직접 보관한다)
//
// 사용: BRIGHTDATA_API_TOKEN=... HOT_DIR=hot-data node scripts/hot/collect.mjs
// 카드뉴스는 인스타가 조회수를 공개하지 않아서 좋아요·댓글 수로만 순위를 매긴다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.env.HOT_DIR || "hot-data");
const THUMBS = path.join(OUT, "thumbs");
const TOKEN = process.env.BRIGHTDATA_API_TOKEN;
const DATASET = process.env.BRIGHTDATA_DATASET_POSTS || "gd_lk5ns7kz21pck8jpis";
const API = "https://api.brightdata.com";
// 기간별 순위는 "그 기간에 늘어난 반응"이라 매일 모든 게시물 수치를 다시 받는다
const DAILY_POSTS = Number(process.env.HOT_DAILY_POSTS || 100);
const BACKFILL_POSTS = Number(process.env.HOT_BACKFILL_POSTS || 100);

const DAY = 86_400_000;
export const PERIODS = { day: 1, week: 7, month: 30, all: Infinity };
const HIST_KEEP = 40; // 하루 1개씩 최근 40일치 수치 보관

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
};

async function bd(pathname, init = {}, tries = 4) {
  let res;
  try {
    res = await fetch(`${API}${pathname}`, {
      ...init,
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    // 잠깐 끊긴 네트워크는 다시 시도 (트리거는 중복 과금을 막으려 재시도하지 않음)
    if (tries <= 1 || init.method === "POST") throw e;
    await sleep(5_000);
    return bd(pathname, init, tries - 1);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`브라이트데이터 ${pathname} ${res.status}: ${text.slice(0, 300)}`);
  return text;
}

async function collect(inputs) {
  // HOT_SNAPSHOT 을 주면 이미 돌린 수집 결과를 다시 받는다 (중간에 끊겼을 때)
  const trig = process.env.HOT_SNAPSHOT ? { snapshot_id: process.env.HOT_SNAPSHOT } : JSON.parse(
    await bd(`/datasets/v3/trigger?dataset_id=${DATASET}&include_errors=true&type=discover_new&discover_by=url`, {
      method: "POST",
      body: JSON.stringify(inputs),
    }),
  );
  const id = trig.snapshot_id;
  if (!id) throw new Error(`트리거 실패: ${JSON.stringify(trig)}`);
  console.log(`▶ 수집 시작 snapshot=${id} (${inputs.length}개 계정)`);
  const started = Date.now();
  for (;;) {
    const p = JSON.parse(await bd(`/datasets/v3/progress/${id}`));
    if (p.status === "ready") break;
    if (p.status === "failed") throw new Error(`수집 실패: ${JSON.stringify(p)}`);
    if (Date.now() - started > 25 * 60_000) throw new Error("수집 시간 초과(25분)");
    await sleep(10_000);
  }
  const text = await bd(`/datasets/v3/snapshot/${id}?format=json`);
  try {
    return JSON.parse(text);
  } catch {
    return text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }
}

function toPost(r) {
  const code = r.shortcode || r.url?.match(/\/p\/([^/?]+)/)?.[1];
  if (!code || !r.user_posted || !r.date_posted) return null;
  // 카드뉴스(캐러셀)·사진만. 릴스/영상은 뺀다
  if (r.content_type && !/carousel|image|photo/i.test(r.content_type)) return null;
  const slidesInfo = Array.isArray(r.post_content) ? r.post_content : [];
  const isCarousel = /carousel/i.test(r.content_type || "") || r.product_type === "carousel_container";
  const kind = isCarousel ? (slidesInfo.some((c) => /video/i.test(c.type || "")) ? "carousel-video" : "carousel") : "image";
  return {
    code,
    account: r.user_posted,
    date: r.date_posted,
    likes: Number(r.likes) || 0,
    comments: Number(r.num_comments) || 0,
    slides: Number(r.photos_number) || (Array.isArray(r.photos) ? r.photos.length : 1),
    caption: Array.from(String(r.description || "").replace(/\s+/g, " ").trim()).slice(0, 220).join(""),
    imageUrl: r.thumbnail || r.photos?.[0] || null,
    kind,
  };
}

/**
 * 기간 동안 늘어난 좋아요·댓글.
 * - 그 기간 이전의 수치 기록이 있으면: 지금 − 그때 (정확)
 * - 기록이 아직 짧으면: 기간 안에 올라온 게시물은 누적 전체, 더 오래된 게시물은
 *   '하루 평균 × 기간 일수'로 추정 (기록이 쌓이면 자동으로 정확한 값으로 바뀐다)
 */
export function gainOf(p, days, now) {
  if (!Number.isFinite(days)) return { likes: p.likes, comments: p.comments };
  const from = now - days * DAY;
  const base = [...(p.hist || [])].reverse().find(([t]) => Date.parse(t) <= from + DAY / 4);
  if (base) {
    return { likes: Math.max(0, p.likes - base[1]), comments: Math.max(0, p.comments - base[2]) };
  }
  const ageDays = Math.max((now - Date.parse(p.date)) / DAY, 1 / 24);
  const ratio = Math.min(1, days / ageDays);
  return { likes: Math.round(p.likes * ratio), comments: Math.round(p.comments * ratio) };
}

/** 기간별 순위: 모든 게시물을 그 기간에 늘어난 반응으로 줄 세운다 (게시물을 빼지 않음) */
export function rankLists(posts, now) {
  const lists = {};
  const gains = {};
  for (const [period, days] of Object.entries(PERIODS)) {
    lists[period] = {};
    for (const p of posts) (gains[p.code] ??= {})[period] = gainOf(p, days, now);
    for (const key of ["likes", "comments"]) {
      lists[period][key] = [...posts]
        .sort((a, b) => gains[b.code][period][key] - gains[a.code][period][key] || b[key] - a[key])
        .map((p) => p.code);
    }
  }
  return { lists, gains };
}

let sharpMod;
async function makeThumb(url, dest) {
  const res = await fetch(url, { headers: { Referer: "https://www.instagram.com/" } });
  if (!res.ok) throw new Error(`썸네일 ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  sharpMod ??= (await import(process.env.SHARP_PATH || "sharp")).default;
  await sharpMod(buf).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 72 }).toFile(dest);
}

async function main() {
  if (!TOKEN) throw new Error("BRIGHTDATA_API_TOKEN 이 없어요.");
  fs.mkdirSync(THUMBS, { recursive: true });
  const { accounts } = readJson(path.join(HERE, "accounts.json"), { accounts: [] });
  const db = readJson(path.join(OUT, "posts.json"), { accounts: {}, posts: [] });
  const known = new Set(db.posts.map((p) => p.account));

  const inputs = accounts.map((a) => ({
    url: `https://www.instagram.com/${a}/`,
    num_of_posts: known.has(a) ? DAILY_POSTS : BACKFILL_POSTS,
    post_type: "Post",
  }));
  const records = await collect(inputs);
  const errors = records.filter((r) => r.error || r.error_code);
  if (errors.length) console.warn(`⚠ 오류 ${errors.length}건`, JSON.stringify(errors.slice(0, 3)).slice(0, 500));

  const posts = [];
  for (const r of records) {
    if (r.user_posted && r.followers) {
      db.accounts[r.user_posted] = { followers: r.followers, posts: r.posts_count ?? null };
    }
    const p = toPost(r);
    if (p) posts.push(p);
  }
  await saveHot({ out: OUT, accounts, db, fresh: posts });
}

/**
 * 받은 게시물(fresh)을 누적 DB에 합치고 → 순위 계산 → 썸네일 → posts.json·hot.json 저장.
 * 브라이트데이터 수집(collect.mjs)과 Aside 수집(aside-collect.mjs)이 함께 쓴다.
 * fresh 항목: { code, account, date?, likes, comments, slides?, caption?, imageUrl? }
 *  - date/caption/slides 가 없으면 예전에 받아 둔 값을 그대로 쓴다
 */
export async function saveHot({ out, accounts, db, fresh }) {
  const OUT = out;
  const THUMBS = path.join(OUT, "thumbs");
  fs.mkdirSync(THUMBS, { recursive: true });
  const byCode = new Map(db.posts.map((p) => [p.code, p]));
  for (const p of fresh) {
    const prev = byCode.get(p.code);
    const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ""));
    const merged = { ...prev, ...clean };
    if (!merged.date) continue; // 올린 날짜를 모르면 순위를 못 매긴다
    const stamp = new Date().toISOString();
    // 하루에 한 번씩 수치 기록 (같은 날 여러 번 돌면 그날 기록을 덮어씀)
    const hist = (prev?.hist || []).filter(([t]) => t.slice(0, 10) !== stamp.slice(0, 10));
    hist.push([stamp, merged.likes, merged.comments]);
    byCode.set(p.code, { ...merged, hist: hist.slice(-HIST_KEEP), collectedAt: stamp });
  }
  console.log(`✔ 게시물 ${fresh.length}개 받음 → 누적 ${byCode.size}개`);

  // 목록에서 빠진 계정의 게시물은 지운다
  const active = new Set(accounts);
  const allPosts = [...byCode.values()].filter((p) => active.has(p.account));
  // 보여 주는 건 '영상 없는 카드뉴스(캐러셀)'만. 나머지는 종류만 기억해 두고(다시 확인 안 하게) 목록에서 뺀다
  const carousels = allPosts.filter((p) => p.kind === "carousel");
  const now = Date.now();

  // 썸네일 만들기 (실패하면 한 번 더)
  let made = 0;
  let failed = 0;
  for (const p of carousels) {
    const file = path.join(THUMBS, `${p.code}.webp`);
    if (fs.existsSync(file) || !p.imageUrl) continue;
    for (let i = 0; i < 2; i++) {
      try {
        await makeThumb(p.imageUrl, file);
        made++;
        break;
      } catch (e) {
        if (i === 1) {
          failed++;
          console.warn(`  썸네일 실패 ${p.code}: ${e.message}`);
        }
      }
    }
  }
  // 사진(썸네일)이 없는 게시물은 화면에 절대 안 내보낸다 — 다음 수집 때 사진이 생기면 그때 나온다
  const posts = carousels.filter((p) => fs.existsSync(path.join(THUMBS, `${p.code}.webp`)));
  const { lists, gains } = rankLists(posts, now);
  const need = new Set(posts.map((p) => p.code));
  const shown = posts;
  for (const f of fs.readdirSync(THUMBS)) {
    if (!need.has(f.replace(/\.webp$/, ""))) fs.unlinkSync(path.join(THUMBS, f));
  }
  console.log(`✔ 썸네일 새로 ${made}개 (실패 ${failed}개) · 사진 없어 숨긴 게시물 ${carousels.length - posts.length}개`);
  // 썸네일이 대부분 실패하면(이미지 도구 고장 등) 올리지 않고 멈춘다 — 사이트의 멀쩡한 데이터를 지키기 위해
  if (made + failed >= 5 && failed / (made + failed) > 0.5) {
    throw new Error(`썸네일이 ${failed}개나 실패해서 올리지 않았어요. 이미지 도구(sharp)를 확인해 주세요.`);
  }

  const updatedAt = new Date(now).toISOString();
  const strip = ({ imageUrl, collectedAt, hist, ...rest }) => ({
    ...rest,
    caption: typeof rest.caption === "string" ? rest.caption : "",
    gain: gains[rest.code],
    tracked: hist?.length ?? 0,
    thumb: fs.existsSync(path.join(THUMBS, `${rest.code}.webp`)),
  });
  fs.writeFileSync(
    path.join(OUT, "posts.json"),
    JSON.stringify({ updatedAt, accounts: db.accounts, posts: allPosts }, null, 0),
  );
  fs.writeFileSync(
    path.join(OUT, "hot.json"),
    JSON.stringify({
      updatedAt,
      accounts: accounts.map((a) => ({ name: a, followers: db.accounts[a]?.followers ?? null })),
      lists,
      posts: Object.fromEntries(shown.map((p) => [p.code, strip(p)])),
    }),
  );
  console.log(`✅ 완료 → ${OUT}/hot.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("❌", e.message);
    process.exit(1);
  });
}
