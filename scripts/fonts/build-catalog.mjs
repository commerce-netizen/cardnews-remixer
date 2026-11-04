// 한글 글꼴 목록 만들기: github.com/fonts-archive 의 모든 글꼴(저장소마다 CSS 1개)을 읽어
// lib/font-catalog.json 으로 저장한다. 실행: node scripts/fonts/build-catalog.mjs
// (gh CLI 로그인 필요. 파일은 jsDelivr CDN에서 그때그때 내려받으므로 앱에는 목록만 들어간다)
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const repos = execFileSync("gh", ["api", "orgs/fonts-archive/repos?per_page=100", "--paginate", "-q",
  '.[] | select(.archived|not) | "\\(.name)\\t\\(.description // "")"'], { encoding: "utf8" })
  .trim().split("\n").map((l) => { const [name, desc] = l.split("\t"); return { name, desc: (desc || "").trim() }; });

const CDN = "https://cdn.jsdelivr.net/gh/fonts-archive";
const W = { thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, normal: 400, book: 400,
  medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, heavy: 900, black: 900 };

function category(desc, name) {
  const s = `${desc} ${name}`.toLowerCase();
  if (/명조|바탕|부리|serif|myeongjo|batang|궁서|붓|brush/.test(s)) return /붓|brush|궁서/.test(s) ? "손글씨" : "명조";
  if (/손글씨|펜|필기|hand|pen|script|일기|글씨|캘리/.test(s)) return "손글씨";
  if (/고딕|gothic|sans|산스|돋움|dotum|스퀘어|square/.test(s)) return "고딕";
  return "디자인";
}

async function one({ name, desc }) {
  const res = await fetch(`${CDN}/${name}/${name}.css`);
  if (!res.ok) return null;
  const css = await res.text();
  const faces = [];
  let family = null;
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const fam = block.match(/font-family:\s*['"]?([^;'"]+)['"]?\s*;/)?.[1]?.trim();
    const style = block.match(/font-style:\s*(\w+)/)?.[1] ?? "normal";
    if (!fam || style !== "normal") continue;
    const url = block.match(/url\(['"]?([^'")]+\.woff2)['"]?\)/)?.[1];
    if (!url || !url.startsWith(`${CDN}/${name}/`)) continue;
    let weight = block.match(/font-weight:\s*([\w]+)/)?.[1] ?? "400";
    weight = /^\d+$/.test(weight) ? Number(weight) : (W[weight.toLowerCase()] ?? 400);
    family ??= fam;
    if (fam !== family) continue; // 한 저장소 = 한 글꼴 가족만
    if (faces.some((f) => f.w === weight)) continue;
    faces.push({ w: weight, f: url.slice(`${CDN}/${name}/`.length) });
  }
  if (!faces.length) return null;
  faces.sort((a, b) => a.w - b.w);
  return { id: name, label: desc || name, family, cat: category(desc, name), faces };
}

const out = [];
const failed = [];
for (let i = 0; i < repos.length; i += 16) {
  const chunk = await Promise.all(repos.slice(i, i + 16).map((r) => one(r).catch(() => null)));
  chunk.forEach((f, j) => (f ? out.push(f) : failed.push(repos[i + j].name)));
  process.stdout.write(`\r${Math.min(i + 16, repos.length)}/${repos.length}`);
}
out.sort((a, b) => a.label.localeCompare(b.label, "ko"));
writeFileSync(new URL("../../lib/font-catalog.json", import.meta.url), JSON.stringify(out));
console.log(`\n글꼴 ${out.length}개 저장, 실패 ${failed.length}개: ${failed.slice(0, 30).join(", ")}`);
