// 디자인 템플릿 탭 E2E (데모 모드, AI 키 불필요)
// 템플릿 만들기·저장 → 편집 화면에 적용 → 겹쳐 띄운 템플릿 화면 → 완성본 저장
// 글꼴은 jsDelivr CDN에서 내려받으므로 인터넷 연결이 필요하다.
// 사용법: npm run build && npm run test:template   (Playwright 필요)
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PORT = 3126;
const BASE = `http://127.0.0.1:${PORT}`;

(async () => {
  const app = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, MOCK_LLM: "1", OPENAI_API_KEY: "" },
    stdio: "ignore",
    detached: true,
  });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cardnews-tpl-"));
  const browser = await chromium.launch();
  try {
    for (let i = 0; ; i++) {
      try { await fetch(BASE); break; } catch {}
      if (i > 40) throw new Error("앱 서버가 뜨지 않음");
      await new Promise((r) => setTimeout(r, 500));
    }

    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });

    // 홈 → 템플릿 탭
    await page.goto(BASE);
    await page.click(".tab:has-text('디자인 템플릿')");
    await page.waitForURL("**/templates");
    assert.equal(await page.locator(".tpl-card").count(), 3, "기본 제공 템플릿 3개");
    assert.ok(await page.locator(".tpl-card", { hasText: "기본 디자인" }).locator(".badge").isVisible());
    console.log("✓ 템플릿 탭: 기본 제공 3개, '기본 디자인'이 쓰는 중");

    // 새 템플릿 만들기 — 표지는 도현, 내지는 지마켓 + 글상자 끄기
    await page.click("button:has-text('새 템플릿 만들기')");
    await page.waitForSelector("text=템플릿 고치기");
    await page.fill("#tpl-name", "내 테스트 디자인");
    await page.selectOption("#font-cover", "dohyeon");
    await page.locator('.swatch[aria-label="#ffe14d"]').first().click();
    await page.locator(".seg", { hasText: "크게" }).locator("button:has-text('크게')").click();

    await page.click(".seg-big button:has-text('내지')");
    await page.selectOption("#font-body", "gmarket");
    await page.locator(".toggle", { hasText: "글상자 쓰기" }).locator("input").uncheck();
    assert.equal(await page.locator("text=글상자 색").count(), 0, "글상자를 끄면 색·진하기 설정은 숨는다");

    await page.fill("#wm-text", "테스트가게");

    // 캡션 CTA (맨 윗줄·맨 아랫줄)
    await page.fill("#cta-top", "😋 레시피 원하면 '나도'!");
    await page.fill("#cta-bottom", "💬 저장하고 따라 해 보세요 👉");
    const ctaPreview = await page.locator(".caption-preview").innerText();
    assert.ok(ctaPreview.startsWith("😋 레시피 원하면 '나도'!"), "맨 윗줄 CTA");
    assert.ok(/💬 저장하고 따라 해 보세요 👉/.test(ctaPreview), "맨 아랫줄 CTA");
    assert.ok(/쿠팡 파트너스 활동의 일환/.test(ctaPreview), "쿠팡 고지는 항상 맨 끝");
    assert.ok(ctaPreview.indexOf("💬 저장하고") < ctaPreview.indexOf("쿠팡 파트너스"), "고지가 CTA 뒤");
    console.log("✓ 표지·내지 글꼴/색/크기, 글상자, 워터마크, 캡션 CTA 설정");

    // CDN 글꼴이 실제로 내려와 미리보기에 쓰이는지
    await page.waitForFunction(() => document.fonts.check('80px "Gmarket Sans"'), null, { timeout: 30_000 });
    const previewFont = await page.evaluate(
      () => getComputedStyle(document.querySelector(".preview-frame p")).fontFamily,
    );
    assert.match(previewFont, /Gmarket Sans/, "내지 미리보기에 고른 글꼴이 적용");
    console.log("✓ CDN 글꼴(Gmarket Sans) 내려받아 미리보기에 적용");

    await page.click("button:has-text('저장하고 이 템플릿 쓰기')");
    await page.waitForSelector(".tpl-card:has-text('내 테스트 디자인')");
    assert.equal(await page.locator(".tpl-card").count(), 4);
    assert.ok(
      await page.locator(".tpl-card", { hasText: "내 테스트 디자인" }).locator(".badge").isVisible(),
      "저장하면 바로 쓰는 템플릿이 된다",
    );
    console.log("✓ 저장 → 목록에 추가되고 '지금 쓰는 중'으로 바뀜");

    // 새로고침해도 남아 있는지 (이 브라우저에 저장)
    await page.reload();
    await page.waitForSelector(".tpl-card:has-text('내 테스트 디자인')");
    console.log("✓ 새로고침해도 템플릿이 남아 있음");

    // 만들기 화면에서 그 템플릿으로 카드뉴스 만들기
    const maker = await browser.newPage({ viewport: { width: 540, height: 675 } });
    const files = [];
    for (const [i, color] of ["#e8785a", "#5a96dc"].entries()) {
      await maker.setContent(`<body style="margin:0;background:${color}"></body>`);
      const f = path.join(tmp, `img${i + 1}.png`);
      await maker.screenshot({ path: f });
      files.push(f);
    }

    await page.click(".tab:has-text('카드뉴스 만들기')");
    await page.waitForSelector("#url");
    await page.click("text=사진을 직접 올려서 만들기");
    await page.setInputFiles("input[type=file]", files);
    await page.waitForSelector(".thumb >> nth=1");
    await page.click("button:has-text('카드뉴스 새로 만들기')");
    await page.waitForSelector("text=각색이 끝났어요", { timeout: 30_000 });

    assert.equal(await page.locator("#template").inputValue(), await templateIdOf(page, "내 테스트 디자인"));
    assert.equal(await page.inputValue("#watermark"), "테스트가게", "템플릿에 저장한 워터마크 문구가 따라온다");
    const cap = await page.inputValue('textarea[aria-label="캡션"]');
    assert.ok(cap.startsWith("😋 레시피 원하면 '나도'!\n\n"), "캡션 맨 윗줄 = 템플릿 CTA");
    assert.ok(cap.trimEnd().endsWith("수수료를 제공받습니다."), "캡션 맨 끝 = 쿠팡 고지");
    assert.ok(/💬 저장하고 따라 해 보세요 👉/.test(cap), "캡션 맨 아랫줄 CTA");
    await page.waitForFunction(() => document.fonts.check('80px "BM DOHYEON"'), null, { timeout: 30_000 });
    const coverFont = await page.evaluate(
      () => getComputedStyle(document.querySelector(".preview-frame p")).fontFamily,
    );
    assert.match(coverFont, /BM DOHYEON/, "표지에 템플릿 글꼴 적용");
    console.log("✓ 편집 화면이 저장한 템플릿(글꼴·워터마크)으로 시작");

    // 템플릿을 기본 디자인으로 바꾸면 미리보기도 바로 바뀐다
    await page.selectOption("#template", "default");
    await page.waitForFunction(
      () => !getComputedStyle(document.querySelector(".preview-frame p")).fontFamily.includes("BM DOHYEON"),
    );
    assert.equal(await page.inputValue("#watermark"), "맛집도둑");
    const capDefault = await page.inputValue('textarea[aria-label="캡션"]');
    assert.ok(capDefault.startsWith("🤤 댓글에 '나도' 남겨주세요!"), "템플릿 바꾸면 캡션 CTA도 바뀜");
    console.log("✓ 템플릿을 바꾸면 미리보기·워터마크·캡션 CTA가 따라 바뀜");

    // 겹쳐 띄운 템플릿 화면 — 고치던 카드뉴스가 사라지지 않아야 한다
    await page.fill("#text0", "안 사라지는 제목");
    await page.click("button:has-text('템플릿 만들기 · 고치기')");
    await page.waitForSelector(".overlay-page");
    await page.locator(".overlay-page").locator(".tpl-card", { hasText: "내 테스트 디자인" }).locator("button:has-text('이 템플릿 쓰기')").click();
    await page.click("text=편집 화면으로 돌아가기");
    await page.waitForSelector(".overlay-page", { state: "detached" });
    assert.equal(await page.inputValue("#text0"), "안 사라지는 제목", "고치던 글이 그대로");
    assert.equal(await page.inputValue("#watermark"), "테스트가게", "겹친 화면에서 고른 템플릿이 반영");
    console.log("✓ 겹쳐 띄운 템플릿 화면에서 골라도 작업물이 그대로 유지");

    // 완성본 저장 — 템플릿 글꼴이 들어간 PNG
    const download = page.waitForEvent("download");
    await page.click("text=승인하고 내려받기");
    const d = await download;
    const zipPath = path.join(tmp, "out.zip");
    await d.saveAs(zipPath);
    const JSZip = require("jszip");
    const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
    assert.deepEqual(Object.keys(zip.files).sort(), ["caption.txt", "slide_01.png", "slide_02.png"]);
    const png = await zip.file("slide_01.png").async("nodebuffer");
    assert.equal(png.readUInt32BE(16), 1080);
    assert.equal(png.readUInt32BE(20), 1350);
    console.log("✓ 템플릿 적용 상태로 승인 → 1080×1350 PNG 저장");

    // 템플릿 지우기
    await page.goto(`${BASE}/templates`);
    const card = page.locator(".tpl-card", { hasText: "내 테스트 디자인" });
    await card.locator("button:has-text('지우기')").click();
    await card.locator("button:has-text('네, 지울래요')").click();
    await page.waitForSelector(".tpl-card:has-text('내 테스트 디자인')", { state: "detached" });
    assert.equal(await page.locator(".tpl-card").count(), 3);
    assert.ok(await page.locator(".tpl-card", { hasText: "기본 디자인" }).locator(".badge").isVisible());
    console.log("✓ 템플릿 지우기 → 기본 디자인으로 되돌아감");
  } finally {
    await browser.close();
    try { process.kill(-app.pid); } catch {}
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});

/** 화면의 템플릿 선택 상자에서 이름으로 값(id) 찾기 */
async function templateIdOf(page, name) {
  return page.$eval(
    "#template",
    (sel, n) => [...sel.options].find((o) => o.textContent.trim() === n)?.value,
    name,
  );
}
