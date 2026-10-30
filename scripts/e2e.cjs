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
    env: { ...process.env, MOCK_LLM: "1", OPENAI_API_KEY: "" },
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

    // 장마다 카드: 1번 장=표지 제목, 2번 장부터=본문
    assert.ok(await page.isVisible("text=1번 장 · 표지"));
    assert.ok(await page.isVisible("text=3번 장"));
    await page.fill("#text0", "직접 고친\n표지 제목");
    await page.fill("#text1", "직접 고친 본문");
    await page.fill("#watermark", "우리가게");
    const first = page.locator(".preview-frame >> nth=0");
    assert.ok(await first.getByText("직접 고친").isVisible());
    assert.ok(await first.getByText("[광고]").isVisible());
    assert.ok(await first.getByText("우리가게").isVisible());
    assert.ok(await page.locator(".preview-frame >> nth=1").getByText("직접 고친 본문").isVisible());
    assert.equal(await page.locator(".preview-frame", { hasText: "우리가게" }).count(), 3);
    console.log("✓ 제목·본문·워터마크 수정이 모든 장 미리보기에 반영");

    // 장별 사진 바꾸기
    const before = await page.locator(".preview-frame >> nth=1").locator("img").getAttribute("src");
    await page.locator(".card", { hasText: "2번 장" }).locator("input[type=file]").setInputFiles(files[0]);
    await page.waitForFunction(
      (b) => document.querySelectorAll(".preview-frame")[1].querySelector("img")?.getAttribute("src") !== b,
      before,
    );
    console.log("✓ 2번 장 사진 교체");

    // 2단계 AI 사진 만들기 (NEXT_PUBLIC_ENABLE_IMAGE_GEN=1 로 빌드했을 때만 버튼이 켜짐)
    const genBtn = page.locator("button:has-text('AI 새 사진 만들기')").first();
    if (await genBtn.count()) {
      await genBtn.click();
      await page.waitForFunction(() =>
        document.querySelector(".preview-frame img")?.getAttribute("src")?.startsWith("data:image/svg+xml"),
      );
      console.log("✓ AI 새 사진 만들기(데모)가 1번째 장에 반영");
    } else {
      assert.ok(await page.isVisible("text=AI 새 사진 (준비 중)"));
      console.log("✓ AI 새 사진 버튼은 '준비 중'으로 꺼져 있음 (기능 스위치 꺼짐)");
    }

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
