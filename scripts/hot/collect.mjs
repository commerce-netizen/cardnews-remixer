// 인기 레시피 탭 데이터 수집기 (매일 GitHub Actions 에서 실행)
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
const DAILY_POSTS = Number(process.env.HOT_DAILY_POSTS || 15);
const BACKFILL_POSTS = Number(process.env.HOT_BACKFILL_POSTS || 100);

const DAY = 86_400_000;
export const PERIODS = { day: 1, week: 7, month: 30, all: Infinity };
const TOP_GLOBAL = 60; // 기간·정렬마다 전체 상위
const TOP_PER_ACCOUNT = 12; // 계정 필터용 계정별 상위

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
  return {
    code,
    account: r.user_posted,
    date: r.date_posted,
    likes: Number(r.likes) || 0,
    comments: Number(r.num_comments) || 0,
    slides: Number(r.photos_number) || (Array.isArray(r.photos) ? r.photos.length : 1),
    caption: String(r.description || "").replace(/\s+/g, " ").trim().slice(0, 220),
    imageUrl: r.thumbnail || r.photos?.[0] || null,
  };
}

/** 기간별 인기 목록 (게시물 코드 배열) */
export function rankLists(posts, now) {
  const lists = {};
  for (const [period, days] of Object.entries(PERIODS)) {
    const inPeriod = posts.filter((p) => now - Date.parse(p.date) <= days * DAY);
    lists[period] = {};
    for (const key of ["likes", "comments"]) {
      const sorted = [...inPeriod].sort((a, b) => b[key] - a[key]);
      const picked = new Set(sorted.slice(0, TOP_GLOBAL).map((p) => p.code));
      const perAccount = {};
      for (const p of sorted) {
        perAccount[p.account] = (perAccount[p.account] || 0) + 1;
        if (perAccount[p.account] <= TOP_PER_ACCOUNT) picked.add(p.code);
      }
      lists[period][key] = sorted.filter((p) => picked.has(p.code)).map((p) => p.code);
    }
  }
  return lists;
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

  const byCode = new Map(db.posts.map((p) => [p.code, p]));
  let fresh = 0;
  for (const r of records) {
    if (r.user_posted && r.followers) {
      db.accounts[r.user_posted] = { followers: r.followers, posts: r.posts_count ?? null };
    }
    const p = toPost(r);
    if (!p) continue;
    const prev = byCode.get(p.code);
    byCode.set(p.code, { ...prev, ...p, collectedAt: new Date().toISOString() });
    fresh++;
  }
  console.log(`✔ 게시물 ${fresh}개 받음 → 누적 ${byCode.size}개`);

  // 목록에서 빠진 계정의 게시물은 지운다
  const active = new Set(accounts);
  const posts = [...byCode.values()].filter((p) => active.has(p.account));
  const now = Date.now();
  const lists = rankLists(posts, now);

  // 목록에 든 게시물 썸네일만 보관
  const need = new Set(Object.values(lists).flatMap((l) => [...l.likes, ...l.comments]));
  const shown = posts.filter((p) => need.has(p.code));
  let made = 0;
  let failed = 0;
  for (const p of shown) {
    const file = path.join(THUMBS, `${p.code}.webp`);
    if (fs.existsSync(file)) continue;
    if (!p.imageUrl) continue;
    try {
      await makeThumb(p.imageUrl, file);
      made++;
    } catch (e) {
      failed++;
      console.warn(`  썸네일 실패 ${p.code}: ${e.message}`);
    }
  }
  for (const f of fs.readdirSync(THUMBS)) {
    if (!need.has(f.replace(/\.webp$/, ""))) fs.unlinkSync(path.join(THUMBS, f));
  }
  console.log(`✔ 썸네일 새로 ${made}개 (실패 ${failed}개)`);

  const updatedAt = new Date(now).toISOString();
  const strip = ({ imageUrl, collectedAt, ...rest }) => ({
    ...rest,
    thumb: fs.existsSync(path.join(THUMBS, `${rest.code}.webp`)),
  });
  fs.writeFileSync(
    path.join(OUT, "posts.json"),
    JSON.stringify({ updatedAt, accounts: db.accounts, posts }, null, 0),
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
