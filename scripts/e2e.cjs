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
    await page.waitForSelector("text=각색이 끝났어요", { timeout: 60_000 });
    assert.equal(await page.locator(".preview-frame").count(), 3);
    console.log("✓ 사진 3장 → 슬라이드 3장 각색(데모)");

    // 버튼을 하나도 안 눌렀는데 사진까지 이미 AI로 바뀌어 있어야 한다 (글·사진 동시 생성)
    const autoShots = await page.evaluate(() =>
      [...document.querySelectorAll(".preview-frame img")].map((im) => [im.src.slice(0, 16), im.naturalWidth, im.naturalHeight]),
    );
    assert.equal(autoShots.length, 3);
    for (const [head, w, h] of autoShots) {
      assert.equal(head, "data:image/jpeg;", "자동 생성된 AI 사진");
      assert.deepEqual([w, h], [1080, 1350]);
    }
    assert.ok(await page.locator("button:has-text('이전 사진으로')").first().isVisible(), "원래 사진으로 되돌릴 수 있다");
    console.log("✓ 버튼 없이 글·사진이 한 번에 완성 (3장 모두 1080×1350 AI 사진)");

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

    // AI 새 사진 (데모 모드: 실제 호출 대신 자리표시 사진) — 2번 장
    const card2 = page.locator(".card", { hasText: "2번 장" });
    const srcOf = () => page.evaluate(() => document.querySelectorAll(".preview-frame")[1].querySelector("img")?.getAttribute("src"));
    const original2 = await srcOf();
    await card2.locator("button:has-text('AI 새 사진')").click();
    await card2.locator(".preview-overlay").waitFor();
    assert.ok(await page.locator("button:has-text('AI 새 사진')").first().isDisabled(), "생성 중엔 다른 장 버튼도 잠김");
    await card2.locator(".preview-overlay").waitFor({ state: "detached", timeout: 30_000 });
    const generated = await srcOf();
    assert.ok(generated.startsWith("data:image/jpeg") && generated !== original2);
    const size = await page.evaluate(() => {
      const img = document.querySelectorAll(".preview-frame")[1].querySelector("img");
      return [img.naturalWidth, img.naturalHeight];
    });
    assert.deepEqual(size, [1080, 1350]);
    assert.ok(await page.locator(".preview-frame >> nth=1").getByText("직접 고친 본문").isVisible(), "글은 그대로");
    console.log("✓ AI 새 사진(데모): 로딩 표시 → 2번 장 배경이 1080×1350 새 사진으로 교체");
    await card2.locator("button:has-text('이전 사진으로')").click();
    assert.equal(await srcOf(), original2);
    await card2.locator("button:has-text('AI 새 사진')").click();
    await card2.locator(".preview-overlay").waitFor({ state: "detached", timeout: 30_000 });
    console.log("✓ 이전 사진으로 되돌리기 / 다시 만들기");

    // 맨 위 '← 처음으로' — 한 번 확인한 뒤에만 돌아간다 (실수로 작업물이 날아가지 않게)
    await page.click("button:has-text('← 처음으로')");
    await page.waitForSelector("text=지금 만든 카드뉴스는 사라져요");
    await page.click("button:has-text('아니요, 계속 할게요')");
    assert.ok(await page.isVisible("text=각색이 끝났어요"), "취소하면 그대로 남아 있다");
    assert.equal(await page.inputValue("#text0"), "직접 고친\n표지 제목", "작업물 유지");
    console.log("✓ 맨 위 '← 처음으로' + 되돌릴 수 없음 확인");

    // 자동 DM: 템플릿 인트로 + AI 레시피 + 버튼 안내
    const dmBox = await page.inputValue('textarea[aria-label="자동 DM"]');
    assert.ok(dmBox.startsWith("댓글로 요청하신 레시피 드립니다!"), "DM 첫 줄은 고정 문구");
    assert.ok(!/딱 1개야/.test(dmBox), "반말 인트로는 빠졌다");
    assert.match(dmBox, /<0 or 재료> 검색해주세요/, "버튼 안내 기본값");
    const pinBox = await page.inputValue('textarea[aria-label="고정 댓글"]');
    assert.match(pinBox, /🙏 DM 못 받으신 분들은 새 댓글 남겨주세요/, "고정 댓글 기본 문구");
    assert.ok(dmBox.trimEnd().endsWith("수수료를 제공받습니다.*"), "맨 끝 = 쿠팡 고지");
    assert.equal((dmBox.match(/✨/g) || []).length, 1, "비밀재료는 딱 한 줄");
    console.log("✓ 고정 댓글 + 자동 DM 문구 생성 (비밀재료 1줄, 정체 비공개)");

    const download = page.waitForEvent("download");
    await page.click("text=승인하고 내려받기");
    const d = await download;
    assert.match(d.suggestedFilename(), /^cardnews_\d{4}-\d{2}-\d{2}\.zip$/);
    const zipPath = path.join(tmp, "out.zip");
    await d.saveAs(zipPath);
    const JSZip = require("jszip");
    const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
    const names = Object.keys(zip.files).sort();
    assert.deepEqual(names, ["caption.txt", "dm.txt", "pinned_comment.txt", "slide_01.png", "slide_02.png", "slide_03.png"]);
    const pin = await zip.file("pinned_comment.txt").async("string");
    assert.match(pin, /레시피 궁금하면 댓글에 '나도' 남겨주세요/);
    assert.match(pin, /<0 or 재료>/, "프로필 검색 키워드 자리");
    const dmTxt = await zip.file("dm.txt").async("string");
    assert.match(dmTxt, /✨ 비밀재료/, "비밀재료 줄");
    assert.ok(!/비밀재료는 .*입니다|비밀재료 ?= ?/.test(dmTxt), "비밀재료의 정체는 안 적힌다");
    assert.match(dmTxt, /🧑‍🍳 만드는 법/);
    assert.match(dmTxt, /1️⃣ .+\n\n2️⃣ /, "단계는 번호 이모지 + 빈 줄 구분");
    assert.match(dmTxt, /쿠팡파트너스 활동의 일환/);
    const png = await zip.file("slide_01.png").async("nodebuffer");
    assert.equal(png.readUInt32BE(16), 1080);
    assert.equal(png.readUInt32BE(20), 1350);
    assert.match(await zip.file("caption.txt").async("string"), /쿠팡 파트너스/);
    await page.waitForSelector("text=완성!");
    console.log("✓ 승인 → zip(PNG 3장 + 캡션 + 고정 댓글 + 자동 DM) 다운로드");
  } finally {
    await browser.close();
    try { process.kill(-app.pid); } catch {}
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
