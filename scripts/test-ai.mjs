// AI 연동 테스트 (OpenAI 키 불필요)
// 실제 OpenAI Responses API / Images API와 같은 모양의 응답을 돌려주는 가짜 서버를 띄우고,
// OPENAI_BASE_URL로 앱을 그쪽에 연결해 /api/remix·/api/image-gen 의 요청 형식·파싱·오류 처리를 확인한다.
// 사용법: npm run build && npm run test:ai
import http from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const FAKE_PORT = 4010;
const APP_PORT = 3124;

const good = {
  slides: [
    { original: "여름 필수템 BEST 3", title: "올여름, 이거 없으면\n후회해요", body: "써 본 사람만 아는 찐템 세 가지." },
    { original: "1. 휴대용 선풍기", title: "손바닥만 한 바람 공장", body: "가방에 쏙, 하루 종일 시원해요." },
  ],
  caption: "더위에 지친 분들 모여라!\n\n#여름필수템 #쿠팡추천",
};

function response(output, extra = {}) {
  return {
    id: "resp_test",
    object: "response",
    created_at: 1761800000,
    status: "completed",
    error: null,
    incomplete_details: null,
    model: "gpt-5-mini-2025-08-07",
    output,
    usage: { input_tokens: 1200, output_tokens: 900, total_tokens: 2100 },
    ...extra,
  };
}
const reasoning = { type: "reasoning", id: "rs_test", summary: [] };
const msg = (content) => ({ type: "message", id: "msg_test", status: "completed", role: "assistant", content });
const err = (status, type, code, message) => [status, { error: { message, type, param: null, code } }];

// 요청 본문에 들어 있는 CASE 표시로 시나리오 선택
const scenarios = {
  ok: () => [200, response([reasoning, msg([{ type: "output_text", text: JSON.stringify(good), annotations: [], logprobs: [] }])])],
  refusal: () => [200, response([reasoning, msg([{ type: "refusal", refusal: "I can't help with that." }])])],
  truncated: () => [200, response(
    [reasoning, msg([{ type: "output_text", text: '{"slides":[{"original":"a","ti', annotations: [], logprobs: [] }])],
    { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } },
  )],
  empty: () => [200, response([reasoning, msg([{ type: "output_text", text: JSON.stringify({ slides: [], caption: "x" }), annotations: [], logprobs: [] }])])],
  quota: () => err(429, "insufficient_quota", "insufficient_quota", "You exceeded your current quota"),
  badkey: () => err(401, "invalid_request_error", "invalid_api_key", "Incorrect API key provided"),
  nomodel: () => err(404, "invalid_request_error", "model_not_found", "The model does not exist"),
  image: () => [200, { created: 1761800000, data: [{ b64_json: Buffer.from("fake-jpeg").toString("base64") }], output_format: "jpeg", quality: "low", size: "1088x1360" }],
  blocked: () => err(400, "image_generation_user_error", "moderation_blocked", "Your request was rejected by the safety system."),
};

// 사진 분석(비전) 응답 — 사진 바이트 안의 CASE 표시로 시나리오를 고르고, 생성 단계 시나리오는 설명문에 실어 넘긴다
function analysisFor(c) {
  if (c === "quota") return scenarios.quota();
  if (c === "analysisbroken") {
    return [200, response([reasoning, msg([{ type: "output_text", text: '{"is_food":tr', annotations: [], logprobs: [] }])],
      { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })];
  }
  const next = { genquota: "quota", blocked: "blocked" }[c] ?? "image";
  const analysis = {
    dish_name_ko: "즉석 떡볶이",
    dish_name_en: "Korean instant tteokbokki",
    dish_description_en: `rice cakes, fish cakes, ramen noodles and glass noodles in bubbling red gochujang sauce in a black pan. CASE:${next}`,
    key_ingredients_en: ["rice cakes", "fish cakes", "ramen noodles", "green onion"],
    photo_look_en: "slightly warm indoor phone photo, soft overhead light",
    original_angle: "top-down",
    original_background_en: "dark gas stove on a wooden table",
  };
  return [200, response([reasoning, msg([{ type: "output_text", text: JSON.stringify(analysis), annotations: [], logprobs: [] }])])];
}
const caseInImage = (json) => {
  const url = json.input?.[0]?.content?.find((c) => c.type === "input_image")?.image_url ?? "";
  return Buffer.from(url.split(",")[1] ?? "", "base64").toString("latin1").match(/CASE:(\w+)/)?.[1] ?? "image";
};

const requests = [];
const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    // 이미지 편집(/images/edits)은 multipart 본문이라 문자열 그대로 보관
    let parsed;
    try { parsed = JSON.parse(body || "{}"); } catch { parsed = body; }
    requests.push({ path: req.url, body: parsed, contentType: req.headers["content-type"] ?? "" });
    const marker = body.match(/CASE:(\w+)/)?.[1];
    const [status, json] = req.url.includes("/images/")
      ? scenarios[["quota", "blocked"].includes(marker) ? marker : "image"]()
      : parsed?.text?.format?.name === "food_photo_analysis"
        ? analysisFor(caseInImage(parsed))
        : scenarios[marker ?? "ok"]();
    res.writeHead(status, { "content-type": "application/json", "retry-after": "0", "x-should-retry": "false" });
    res.end(JSON.stringify(json));
  });
});
await new Promise((r) => fake.listen(FAKE_PORT, r));

// 기본 설정 앱 + 'AI 새 사진' describe 방식 앱 두 개를 띄운다
const DESCRIBE_PORT = APP_PORT + 1;
const startApp = (port, env = {}) =>
  spawn("npx", ["next", "start", "-p", String(port)], {
    env: {
      ...process.env,
      OPENAI_API_KEY: "sk-test",
      OPENAI_BASE_URL: `http://127.0.0.1:${FAKE_PORT}/v1`,
      MOCK_LLM: "",
      OPENAI_IMAGE_MODE: "",
      ...env,
    },
    stdio: "ignore",
    detached: true,
  });
const apps = [startApp(APP_PORT), startApp(DESCRIBE_PORT, { OPENAI_IMAGE_MODE: "describe" })];
const stop = () => { for (const a of apps) { try { process.kill(-a.pid); } catch {} } fake.close(); };

async function post(path, payload, port = APP_PORT) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, json: await res.json() };
}
const remix = (slideText, extra = {}) => post("/api/remix", { slideText, caption: "원본 캡션", ...extra });
const last = () => requests.at(-1);

try {
  for (const port of [APP_PORT, DESCRIBE_PORT]) {
    for (let i = 0; ; i++) {
      try { await fetch(`http://127.0.0.1:${port}/`); break; } catch {}
      if (i > 40) throw new Error("앱 서버가 뜨지 않음");
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const tinyJpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";
  // 가짜 서버가 시나리오를 고를 수 있도록 사진 바이트 안에 CASE 표시를 넣은 테스트용 사진
  const photo = (c) => `data:image/jpeg;base64,${Buffer.from(`\xff\xd8CASE:${c}`).toString("base64")}`;
  /** 사실감 지시는 있고, 미화·보정 표현은 없어야 한다 + 글자·오버레이 제거 */
  const checkRealisticPrompt = (prompt) => {
    assert.match(prompt, /PHOTOREALISM/);
    assert.match(prompt, /not AI-generated/);
    assert.match(prompt, /Do NOT beautify, enhance, idealize or stylize/);
    assert.match(prompt, /AI로 생성한 티가 안 나게/);
    assert.match(prompt, /원본 사진의 사실적인 질감·분위기를 그대로 유지/);
    for (const banned of [/delicious/i, /appetiz/i, /mouth-?watering/i, /professional food photography/i, /magazine/i, /glossy sheen/i, /steam/i, /vivid/i, /맛있/, /먹음직/, /윤기/, /모락모락/, /생생한/]) {
      assert.ok(!banned.test(prompt), `미화 표현이 남아 있음: ${banned}`);
    }
    assert.match(prompt, /semi-transparent text box/);
    assert.match(prompt, /dark gradient band at the bottom/);
    assert.match(prompt, /\[광고\]/);
    assert.match(prompt, /하단 그라데이션·반투명 텍스트박스를 완전히 제거/);
  };

  const cases = [
    ["각색 정상 → 슬라이드 + 캡션 본문(CTA·고지는 화면에서 붙임)", () => remix("CASE:ok"), (r) => {
      assert.equal(r.status, 200);
      assert.equal(r.json.slides.length, 2);
      assert.equal(r.json.slides[0].title, good.slides[0].title);
      assert.equal(r.json.caption, good.caption.trim());
      assert.ok(!/쿠팡 파트너스 활동의 일환/.test(r.json.caption), "고지 문구는 서버가 붙이지 않는다");
      const { path, body } = last();
      assert.equal(path, "/v1/responses");
      assert.equal(body.model, "gpt-5-mini");
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      assert.equal(body.reasoning.effort, "low");
      assert.ok(body.max_output_tokens <= 8000);
      assert.ok(body.instructions.includes("각색 원칙"));
      // 레퍼런스에서 뽑은 형식 규칙이 프롬프트에 들어가 있는지
      const ins = body.instructions;
      assert.ok(ins.includes("정확히 3줄"), "슬라이드 3줄 규칙");
      assert.ok(ins.includes("이모지는 절대 쓰지 않습니다"), "슬라이드 이모지 금지");
      assert.ok(ins.includes("반말 구어체"), "슬라이드 반말 톤");
      assert.ok(ins.includes("존댓말 '~요'체"), "캡션 존댓말 톤");
      assert.ok(ins.includes("정확히 3문장"), "캡션 3문장 규칙");
      assert.ok(/CTA 문구·해시태그·쿠팡 파트너스 고지는 넣지 마세요/.test(ins), "캡션에 CTA·고지 금지");
    }],
    ["사진 글씨 읽기(vision) 요청 형식", () => remix("CASE:ok", { imageDataUrls: [tinyJpeg, tinyJpeg] }), (r) => {
      assert.equal(r.status, 200);
      const images = last().body.input[0].content.filter((c) => c.type === "input_image");
      assert.equal(images.length, 2);
      assert.equal(images[0].image_url, tinyJpeg);
      assert.equal(images[0].detail, "high");
    }],
    ["거절(refusal)", () => remix("CASE:refusal"), (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /거절/); }],
    ["잘린 응답(max_output_tokens)", () => remix("CASE:truncated"), (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /다시 한 번/); }],
    ["빈 슬라이드", () => remix("CASE:empty"), (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /다시 한 번/); }],
    ["429 사용 한도 소진", () => remix("CASE:quota"), (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /사용 한도/); }],
    ["401 잘못된 키", () => remix("CASE:badkey"), (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /키가 올바르지/); }],
    ["404 모델 없음(지원 종료 등)", () => remix("CASE:nomodel"), (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /모델/); }],
    ["입력 없음", () => remix(""), (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /필요해요/); }],
    ["AI 새 사진(기본=편집): 원본 사진으로 구도·배경만 바꾸고 사실적으로", () => post("/api/image-gen", { image: photo("image"), title: "제목" }), (r) => {
      assert.equal(r.status, 200);
      assert.match(r.json.image, /^data:image\/jpeg;base64,/);
      const { path, body, contentType } = last();
      assert.equal(path, "/v1/images/edits");
      assert.notEqual(requests.at(-2)?.body?.text?.format?.name, "food_photo_analysis", "기본 방식은 분석 단계 없이 바로 편집");
      assert.match(contentType, /^multipart\/form-data/);
      const field = (name) => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`))?.[1];
      assert.equal(field("model"), "gpt-image-2.5-sunburst");
      assert.equal(field("size"), "1088x1360");
      assert.ok(body.includes("CASE:image"), "원본 사진 바이트가 그대로 전송돼야 함");
      const prompt = field("prompt");
      checkRealisticPrompt(prompt);
      // (3) 같은 요리·재료·사진 느낌 유지, 구도·배경·배치만 변경
      assert.match(prompt, /KEEP: the same dish, the same ingredients/);
      assert.match(prompt, /CHANGE ONLY the composition, the background and the placement/);
      assert.match(prompt, /구도·배경·배치\(음식 위치\/앵글\)만 바꿔라/);
    }],
    ["AI 새 사진(describe 방식 선택 시): 분석 → 사실적으로 다시 촬영", () => post("/api/image-gen", { image: photo("image") }, DESCRIBE_PORT), (r) => {
      assert.equal(r.status, 200);
      const [analyzeReq, genReq] = requests.slice(-2);
      assert.equal(analyzeReq.body.text.format.name, "food_photo_analysis");
      assert.match(analyzeReq.body.instructions, /no praise or marketing words/);
      assert.equal(genReq.path, "/v1/images/generations");
      const { prompt } = genReq.body;
      checkRealisticPrompt(prompt);
      assert.match(prompt, /Korean instant tteokbokki \(즉석 떡볶이\)/);
      assert.match(prompt, /rice cakes, fish cakes, ramen noodles, green onion/);
      assert.match(prompt, /Photo look to match \(keep it the same\): slightly warm indoor phone photo/);
      assert.match(prompt, /The reference was top-down on dark gas stove on a wooden table — use a different angle and background/);
      assert.ok(!/looking more straight down/.test(prompt), "원본과 같은 앵글을 고르면 안 됨");
    }],
    ["AI 새 사진(describe): 분석 실패 시 편집으로 대체", () => post("/api/image-gen", { image: photo("analysisbroken") }, DESCRIBE_PORT), (r) => {
      assert.equal(r.status, 200);
      assert.equal(last().path, "/v1/images/edits");
      assert.ok(last().body.includes("CASE:analysisbroken"));
    }],
    ["AI 새 사진: 사진 없는 장은 글로 생성", () => post("/api/image-gen", { title: "휴대용 선풍기" }), (r) => {
      assert.equal(r.status, 200);
      const { path, body } = last();
      assert.equal(path, "/v1/images/generations");
      assert.equal(body.size, "1088x1360");
      checkRealisticPrompt(body.prompt);
    }],
    ["AI 새 사진: 한도 소진", () => post("/api/image-gen", { image: photo("quota") }), (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /사용 한도/); assert.equal(last().path, "/v1/images/edits"); }],
    ["AI 새 사진(describe): 분석 단계 한도 소진", () => post("/api/image-gen", { image: photo("quota") }, DESCRIBE_PORT), (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /사용 한도/); assert.equal(last().path, "/v1/responses"); }],
    ["AI 새 사진: 안전 기준 차단", () => post("/api/image-gen", { image: photo("blocked") }), (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /안전 기준/); }],
    ["AI 새 사진: 잘못된 사진 형식", () => post("/api/image-gen", { image: "data:text/plain;base64,aGk=" }), (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /사진 형식/); }],
    ["AI 새 사진: 사진도 글도 없음", () => post("/api/image-gen", {}), (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /사진을 넣거나 글을/); }],
  ];

  let failed = 0;
  for (const [name, run, check] of cases) {
    const r = await run();
    try { check(r); console.log(`✓ ${name}`); }
    catch (e) { failed++; console.log(`✗ ${name}\n  ${e.message}\n  응답: ${JSON.stringify(r)}`); }
  }
  process.exitCode = failed ? 1 : 0;
} finally {
  stop();
}
