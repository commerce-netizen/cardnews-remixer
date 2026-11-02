// 인기 카드뉴스 데이터 수집기 — Aside 브라우저 버전 (브라이트데이터 대신, 무료)
//
// 이 맥에서 매일 아침 실행된다 (launchd: scripts/hot/aside-install.sh 로 설치).
// Aside 브라우저(인스타 로그인 상태)로 각 계정 프로필을 열고, 게시물 격자에 마우스를 올리면
// 뜨는 좋아요·댓글 수를 읽는다. 처음 보는 게시물만 게시물 페이지를 열어 올린 날짜·캡션을 읽는다.
// 처음 보는 게시물만 임베드 페이지로 종류를 확인해 **캐러셀(카드뉴스) 중 영상 슬라이드가 없는 것만** 남긴다.
// (릴스·영상·사진 1장·영상 섞인 카드뉴스는 제외 — 각색기는 이미지만 재생성 가능)
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
const DETAIL_BATCH = 20; // 게시물당 1.5~5초 → 한 번에 20개 (Aside 1회 실행 120초 제한)
const PUSH = !process.argv.includes("--no-push");
// --keep-local: 받아 둔 로컬 데이터를 그대로 이어서 씀 (테스트용, 평소엔 GitHub 의 최신 데이터를 받아 옴)
const KEEP_LOCAL = process.argv.includes("--keep-local");

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

/**
 * 게시물 종류 확인 (한 번 확인한 게시물은 posts.json 에 kind 로 기억해서 다시 안 본다)
 * 임베드 페이지 한 장으로: 캐러셀인지, 슬라이드 중 영상이 있는지, 장수, 캡션
 */
function scrapeDetails(codes) {
  return repl(`
const res = [];
for (const c of ${JSON.stringify(codes)}) {
  try {
    await openTab("https://www.instagram.com/p/" + c + "/embed/captioned/");
    const html = await page.content();
    const i = html.indexOf('"contextJSON":');
    let info = null;
    if (i >= 0) try {
      const s = html.indexOf('"', i + 14); let k = s + 1;
      while (k < html.length) { if (html[k] === "\\\\") k += 2; else if (html[k] === '"') break; else k++; }
      const m = JSON.parse(JSON.parse(html.slice(s, k + 1)))?.gql_data?.shortcode_media;
      if (m) {
        const kids = (m.edge_sidecar_to_children?.edges || []).map(e => e.node);
        info = { type: m.__typename, video: !!m.is_video, videoSlides: kids.filter(n => n.is_video).length, slides: kids.length || 1, caption: m.edge_media_to_caption?.edges?.[0]?.node?.text || "" };
      }
    } catch (e) { info = null; } // 퍼가기 막힌 게시물은 여기서 깨진다 → 아래 일반 페이지로
    if (!info) {
      // 퍼가기를 막아 둔 계정/게시물: 일반 게시물 페이지 안의 데이터(carousel_media)로 확인
      for (const t of [...tabs]) { try { await closeTab(t); } catch (e) {} }
      await openTab("https://www.instagram.com/p/" + c + "/");
      await sleep(1200);
      info = await page.evaluate((code) => {
        const find = (o, d = 0) => {
          if (!o || typeof o !== "object" || d > 300) return null;
          if (o.code === code && ("media_type" in o)) return o;
          for (const v of Array.isArray(o) ? o : Object.values(o)) { const r = find(v, d + 1); if (r) return r; }
          return null;
        };
        for (const sc of document.querySelectorAll('script[type="application/json"]')) {
          if (!sc.textContent.includes(code)) continue;
          let m; try { m = find(JSON.parse(sc.textContent)); } catch (e) { continue; }
          if (!m) continue;
          const kids = m.carousel_media || [];
          return {
            type: m.media_type === 8 ? "GraphSidecar" : m.media_type === 2 ? "GraphVideo" : "GraphImage",
            video: m.media_type === 2,
            videoSlides: kids.filter(k => k.media_type === 2).length,
            slides: kids.length || 1,
            caption: m.caption?.text || "",
          };
        }
        return null;
      }, c);
    }
    res.push([c, info]);
  } catch (e) { res.push([c, null]); }
  for (const t of [...tabs]) { try { await closeTab(t); } catch (e) {} }
}
__out = res;
`);
}

/** 게시물 코드에 올린 시각이 들어 있다 (인스타 ID 규칙) */
export function dateFromCode(code) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let n = 0n;
  for (const ch of code.slice(0, 11)) n = n * 64n + BigInt(A.indexOf(ch));
  return new Date(Number(n >> 23n) + 1314220021721).toISOString();
}

/** 카드뉴스로 쓸 수 있는 것만: 캐러셀 + 영상 슬라이드 없음 */
function kindOf(d) {
  if (d.type === "GraphSidecar") return d.videoSlides ? "carousel-video" : "carousel";
  return d.video || d.type === "GraphVideo" ? "video" : "image";
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}

function loadAccounts() {
  // 매일 실행 스크립트(aside-run.sh)가 main 을 먼저 받아 오므로 이 파일 = GitHub main 의 목록
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

async function main() {
  const accounts = loadAccounts();
  log(`▶ Aside 수집 시작 (${accounts.length}개 계정: ${accounts.join(", ")})`);
  if (!KEEP_LOCAL || !fs.existsSync(path.join(OUT, "posts.json"))) pullData();
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

  // 종류를 아직 모르는 게시물만 확인 (처음 넣은 계정은 전부, 평소엔 새 게시물만)
  const unknown = fresh.filter((p) => !known.get(p.code)?.kind).map((p) => p.code);
  log(`  종류 확인할 게시물 ${unknown.length}개`);
  const details = new Map();
  for (let i = 0; i < unknown.length; i += DETAIL_BATCH) {
    if (i && i % 100 === 0) log(`    …${i}/${unknown.length}`);
    try {
      for (const [c, d] of scrapeDetails(unknown.slice(i, i + DETAIL_BATCH))) if (d) details.set(c, d);
    } catch (e) {
      log(`⚠ 게시물 확인 일부 실패: ${e.message.slice(0, 200)}`);
    }
  }
  const finalFresh = fresh.map((p) => {
    const d = details.get(p.code);
    const base = { ...p, date: known.get(p.code)?.date || dateFromCode(p.code) };
    return d ? { ...base, kind: kindOf(d), slides: d.slides, caption: d.caption.replace(/\s+/g, " ").trim().slice(0, 220) } : base;
  });
  const count = (k) => finalFresh.filter((p) => (p.kind || known.get(p.code)?.kind) === k).length;
  log(`  카드뉴스 ${count("carousel")}개 / 제외: 영상 섞인 카드뉴스 ${count("carousel-video")}, 릴스·영상 ${count("video")}, 사진 1장 ${count("image")}`);

  process.env.SHARP_PATH ||= path.join(BASE, "sharp/node_modules/sharp/lib/index.js");
  await saveHot({ out: OUT, accounts, db, fresh: finalFresh });
  if (PUSH) {
    pushData();
    log("✅ hot-data 브랜치에 올렸어요 (사이트에는 10분 안에 반영)");
  } else {
    log(`✅ 수집만 완료 → ${OUT}`);
  }
}

if (process.env.HOT_DEBUG_CODES) {
  console.log(JSON.stringify(scrapeDetails(process.env.HOT_DEBUG_CODES.split(","))));
  process.exit(0);
}

main().catch((e) => {
  log("❌", e.message);
  process.exit(1);
});
