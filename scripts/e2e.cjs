// 화면 전체 흐름 E2E (데모 모드, AI 키 불필요)
// 주소 입력 → (추출 실패) 수동 업로드 → 각색 → 템플릿 변경·글 수정 → 승인 → zip 다운로드
// 사용법: npm run build && npm run test:e2e   (Playwright 필요)
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PORT = 3125;
const BASE = `http://127.0.0.1:${PORT}`;

(async () => {
  const app = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, MOCK_LLM: "1" },
    stdio: "ignore",
    detached: true,
  });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cardnews-e2e-"));
  const browser = await chromium.launch();
  try {
    for (let i = 0; ; i++) {
      try { await fetch(BASE); break; } catch {}
      if (i > 40) throw new Error("앱 서버가 뜨지 않음");
      await new Promise((r) => setTimeout(r, 500));
    }

    // 업로드용 테스트 이미지 만들기
    const maker = await browser.newPage({ viewport: { width: 540, height: 675 } });
    const files = [];
    for (const [i, color] of ["#e8785a", "#5a96dc", "#78be78"].entries()) {
      await maker.setContent(`<body style="margin:0;background:${color}"></body>`);
      const f = path.join(tmp, `img${i + 1}.png`);
      await maker.screenshot({ path: f });
      files.push(f);
    }

    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    await page.goto(BASE);

    // 인스타가 아닌 주소 → 수동 화면으로 안내
    await page.fill("#url", "https://example.com/p/abc");
    await page.click("button:has-text('카드뉴스 새로 만들기')");
    await page.waitForSelector("text=직접 올려서 만들기");
    assert.ok(await page.isVisible("text=인스타그램 주소만"));
    console.log("✓ 추출 실패 시 수동 업로드 화면으로 이동");

    await page.setInputFiles("input[type=file]", files);
    await page.waitForSelector(".thumb >> nth=2");
    await page.click("button:has-text('카드뉴스 새로 만들기')");
    await page.waitForSelector("text=각색이 끝났어요", { timeout: 30_000 });
    assert.equal(await page.locator(".preview-frame").count(), 3);
    console.log("✓ 사진 3장 → 슬라이드 3장 각색(데모)");

    await page.click("button:has-text('노란 포인트')");
    await page.fill("#t0", "직접 고친 제목");
    assert.ok(await page.locator(".preview-frame >> nth=0").getByText("직접 고친 제목").isVisible());
    console.log("✓ 템플릿 변경·텍스트 수정이 미리보기에 반영");

    const download = page.waitForEvent("download");
    await page.click("text=승인하고 내려받기");
    const d = await download;
    assert.match(d.suggestedFilename(), /^cardnews_\d{4}-\d{2}-\d{2}\.zip$/);
    const zipPath = path.join(tmp, "out.zip");
    await d.saveAs(zipPath);
    const JSZip = require("jszip");
    const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
    const names = Object.keys(zip.files).sort();
    assert.deepEqual(names, ["caption.txt", "slide_01.png", "slide_02.png", "slide_03.png"]);
    const png = await zip.file("slide_01.png").async("nodebuffer");
    assert.equal(png.readUInt32BE(16), 1080);
    assert.equal(png.readUInt32BE(20), 1350);
    assert.match(await zip.file("caption.txt").async("string"), /쿠팡 파트너스/);
    await page.waitForSelector("text=완성!");
    console.log("✓ 승인 → zip(1080×1350 PNG 3장 + 캡션) 다운로드");
  } finally {
    await browser.close();
    try { process.kill(-app.pid); } catch {}
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
