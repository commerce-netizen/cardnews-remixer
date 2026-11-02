// 인기 카드뉴스 데이터 수집기 — Aside 브라우저 버전 (브라이트데이터 대신, 무료)
//
// 이 맥에서 매일 아침 실행된다 (launchd: scripts/hot/aside-install.sh 로 설치).
// Aside 브라우저(인스타 로그인 상태)로 각 계정 프로필을 열고, 게시물 격자에 마우스를 올리면
// 뜨는 좋아요·댓글 수를 읽는다. 처음 보는 게시물만 게시물 페이지를 열어 올린 날짜·캡션을 읽는다.
// 결과는 collect.mjs 의 saveHot 으로 합치고 hot-data 브랜치에 올린다 (사이트는 10분 안에 반영).
//
// 계정 목록: GitHub main 의 scripts/hot/accounts.json (고치면 다음 실행부터 반영, 개수 제한 없음)
// AI(에이전트)를 쓰지 않는 스크립트 조종(aside repl)이라 Aside 크레딧이 들지 않는다.
//
// 사용: node scripts/hot/aside-collect.mjs            (수집 + 업로드)
//       node scripts/hot/aside-collect.mjs --no-push  (수집만, 업로드 안 함)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { saveHot } from "./collect.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const BASE = process.env.HOT_BASE || path.join(HOME, ".cardnews-hot");
const OUT = path.join(BASE, "hot-data");
const ASIDE = process.env.ASIDE_BIN || path.join(HOME, ".local/bin/aside");
const REPO = "commerce-netizen/cardnews-remixer";
const MAX_POSTS = Number(process.env.HOT_MAX_POSTS || 100); // 계정당 최근 게시물 몇 개까지 볼지
const DETAIL_BATCH = 15; // 게시물 페이지는 한 번에 15개씩 (Aside 1회 실행 120초 제한)
const PUSH = !process.argv.includes("--no-push");

const log = (...a) => console.log(new Date().toLocaleTimeString("ko-KR"), ...a);

/** Aside 브라우저에서 JS 실행 → 마지막 @@OUT@@ 줄의 JSON 을 돌려준다 */
function repl(code) {
  const wrapped = `
let __out;
try { ${code} } finally { for (const __t of [...tabs]) { try { await closeTab(__t); } catch (e) {} } }
console.log("@@OUT@@" + JSON.stringify(__out));`;
  const stdout = execFileSync(ASIDE, ["repl", wrapped], { encoding: "utf8", timeout: 150_000, maxBuffer: 50 * 1024 * 1024 });
  const line = stdout.split("\n").reverse().find((l) => l.startsWith("@@OUT@@"));
  if (!line) throw new Error(`Aside 응답을 못 읽었어요: ${stdout.slice(-400)}`);
  return JSON.parse(line.slice(7));
}

/** "1.2만" "3,456" "1.5천" "12K" → 숫자 */
export function parseCount(s) {
  if (!s) return 0;
  const m = String(s).replace(/,/g, "").match(/([\d.]+)\s*(만|천|억|K|M)?/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const mul = { 만: 1e4, 천: 1e3, 억: 1e8, k: 1e3, m: 1e6 }[(m[2] || "").toLowerCase()] || 1;
  return Math.round(n * mul);
}

/** 프로필 격자를 내리며 게시물마다 마우스를 올려 좋아요·댓글 수를 읽는다 */
function scrapeProfile(account) {
  return repl(`
await openTab("https://www.instagram.com/${account}/");
await sleep(2000);
const loginWall = await page.evaluate(() => !!document.querySelector('input[name="username"]') || /가입하기/.test(document.querySelector('[role="dialog"]')?.innerText || ""));
const followers = await page.evaluate(() => ([...document.querySelectorAll("a, span, li")].map(e => (e.innerText || "").trim()).find(t => /^팔로워\\s/.test(t)) || ""));
const done = new Map();
let idle = 0;
const t0 = Date.now();
for (let k = 0; !loginWall && k < 60 && done.size < ${MAX_POSTS} && Date.now() - t0 < 95000; k++) {
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href*="/p/"]')].map(a => a.getAttribute("href")));
  const before = done.size;
  for (const h of hrefs) {
    if (done.has(h) || done.size >= ${MAX_POSTS}) continue;
    const a = page.locator('a[href="' + h + '"]').first();
    try {
      await a.hover({ timeout: 2000 }); await sleep(150);
      done.set(h, await a.evaluate(el => { const img = el.querySelector("img"); return { txt: el.innerText.replace(/\\s+/g, " ").trim(), stats: [...el.querySelectorAll("ul li")].map(li => [li.innerText.trim(), li.querySelector(":scope > span:last-child")?.className || ""]), src: img?.src || "", alt: img?.alt || "", reel: !!el.querySelector('svg[aria-label*="릴스"], svg[aria-label*="Reel"], svg[aria-label*="클립"], svg[aria-label*="Clip"]') }; }));
    } catch (e) {}
  }
  idle = done.size === before ? idle + 1 : 0;
  if (idle >= 3) break;
  await page.mouse.wheel(0, 1800); await sleep(900);
}
__out = { loginWall, followers, posts: [...done.entries()] };
`);
}

/** 처음 보는 게시물: 게시물 페이지에서 올린 날짜·캡션 */
function scrapeDetails(codes) {
  return repl(`
const res = [];
for (const c of ${JSON.stringify(codes)}) {
  try {
    await openTab("https://www.instagram.com/p/" + c + "/");
    await sleep(800);
    res.push([c, await page.evaluate(() => ({
      date: document.querySelector("time[datetime]")?.getAttribute("datetime") || null,
      desc: document.querySelector('meta[property="og:description"]')?.content || "",
      video: !!document.querySelector('meta[property="og:video"]') || !!document.querySelector("main video"),
    }))]);
  } catch (e) { res.push([c, null]); }
  for (const t of [...tabs]) { try { await closeTab(t); } catch (e) {} }
}
__out = res;
`);
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}

async function loadAccounts() {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/main/scripts/hot/accounts.json?v=${Date.now()}`);
    if (res.ok) return (await res.json()).accounts;
  } catch {}
  return JSON.parse(fs.readFileSync(path.join(HERE, "accounts.json"), "utf8")).accounts;
}

function pullData() {
  fs.rmSync(OUT, { recursive: true, force: true });
  try {
    sh("git", ["clone", "-q", "--depth", "1", "--branch", "hot-data", `https://github.com/${REPO}.git`, OUT]);
    fs.rmSync(path.join(OUT, ".git"), { recursive: true, force: true });
  } catch {
    fs.mkdirSync(OUT, { recursive: true });
  }
}

function pushData() {
  fs.writeFileSync(path.join(OUT, "vercel.json"), '{"git":{"deploymentEnabled":false}}');
  const g = (...a) => sh("git", ["-C", OUT, ...a]);
  g("init", "-q", "-b", "hot-data");
  g("add", "-A");
  g("-c", "user.name=hot-posts-aside", "-c", "user.email=aside@users.noreply.github.com", "commit", "-qm", `인기 카드뉴스 데이터 (Aside) ${new Date().toISOString().slice(0, 16)}Z`);
  g("push", "-qf", `https://github.com/${REPO}.git`, "hot-data");
}

/** "8 likes, 17 comments - user - November 1, 2026: "캡션"" → 캡션 */
const captionFrom = (desc) => {
  const i = desc.indexOf(': "');
  const body = i >= 0 ? desc.slice(i + 3).replace(/"\.?\s*$/, "") : desc;
  return body.replace(/\s+/g, " ").trim().slice(0, 220);
};

async function main() {
  const accounts = await loadAccounts();
  log(`▶ Aside 수집 시작 (${accounts.length}개 계정: ${accounts.join(", ")})`);
  pullData();
  const db = fs.existsSync(path.join(OUT, "posts.json"))
    ? JSON.parse(fs.readFileSync(path.join(OUT, "posts.json"), "utf8"))
    : { accounts: {}, posts: [] };
  const known = new Map(db.posts.map((p) => [p.code, p]));

  const fresh = [];
  for (const account of accounts) {
    let r;
    try {
      r = scrapeProfile(account);
    } catch (e) {
      log(`⚠ @${account} 실패: ${e.message.slice(0, 200)}`);
      continue;
    }
    if (r.loginWall) throw new Error("Aside 브라우저에 인스타그램 로그인이 풀렸어요. Aside에서 instagram.com 에 다시 로그인해 주세요.");
    if (r.followers) db.accounts[account] = { ...db.accounts[account], followers: parseCount(r.followers.replace(/^팔로워/, "")) };
    // 격자 숫자는 [좋아요, 댓글] 순서. 하나만 보이면(좋아요 숨김 또는 댓글 끔) 옆 아이콘 모양으로 구분한다
    const heartIcons = new Map();
    for (const [, v] of r.posts) if (v.stats?.length === 2) heartIcons.set(v.stats[0][1], (heartIcons.get(v.stats[0][1]) || 0) + 1);
    const heart = [...heartIcons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    for (const [href, v] of r.posts) {
      const code = href.match(/\/p\/([^/]+)/)?.[1];
      if (!code || v.reel || !v.stats?.length) continue;
      let likes, comments;
      if (v.stats.length >= 2) [likes, comments] = [parseCount(v.stats[0][0]), parseCount(v.stats[1][0])];
      else if (heart && v.stats[0][1] === heart) [likes, comments] = [parseCount(v.stats[0][0]), 0];
      else [likes, comments] = [known.get(code)?.likes ?? 0, parseCount(v.stats[0][0])];
      fresh.push({ code, account, likes, comments, imageUrl: v.src || undefined });
    }
    log(`  @${account}: 게시물 ${r.posts.length}개, ${r.followers || "팔로워 ?"}`);
  }
  if (!fresh.length) throw new Error("게시물을 하나도 못 읽었어요.");

  // 처음 보는 게시물만 날짜·캡션 읽기
  const unknown = fresh.filter((p) => !known.get(p.code)?.date).map((p) => p.code);
  log(`  새 게시물 ${unknown.length}개 날짜·캡션 확인`);
  const details = new Map();
  for (let i = 0; i < unknown.length; i += DETAIL_BATCH) {
    try {
      for (const [c, d] of scrapeDetails(unknown.slice(i, i + DETAIL_BATCH))) if (d) details.set(c, d);
    } catch (e) {
      log(`⚠ 게시물 상세 일부 실패: ${e.message.slice(0, 200)}`);
    }
  }
  const finalFresh = [];
  for (const p of fresh) {
    const d = details.get(p.code);
    if (d?.video) continue; // 릴스·영상은 뺀다
    finalFresh.push(d ? { ...p, date: d.date, caption: captionFrom(d.desc) } : p);
  }

  process.env.SHARP_PATH ||= path.join(BASE, "sharp/node_modules/sharp/lib/index.js");
  await saveHot({ out: OUT, accounts, db, fresh: finalFresh });
  if (PUSH) {
    pushData();
    log("✅ hot-data 브랜치에 올렸어요 (사이트에는 10분 안에 반영)");
  } else {
    log(`✅ 수집만 완료 → ${OUT}`);
  }
}

main().catch((e) => {
  log("❌", e.message);
  process.exit(1);
});
