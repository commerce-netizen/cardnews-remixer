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

const requests = [];
const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    // 이미지 편집(/images/edits)은 multipart 본문이라 문자열 그대로 보관
    let parsed;
    try { parsed = JSON.parse(body || "{}"); } catch { parsed = body; }
    requests.push({ path: req.url, body: parsed, contentType: req.headers["content-type"] ?? "" });
    const name = req.url.includes("/images/")
      ? (body.match(/CASE:(\w+)/)?.[1] ?? "image")
      : (body.match(/CASE:(\w+)/)?.[1] ?? "ok");
    const [status, json] = scenarios[name]();
    res.writeHead(status, { "content-type": "application/json", "retry-after": "0", "x-should-retry": "false" });
    res.end(JSON.stringify(json));
  });
});
await new Promise((r) => fake.listen(FAKE_PORT, r));

const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
  env: {
    ...process.env,
    OPENAI_API_KEY: "sk-test",
    OPENAI_BASE_URL: `http://127.0.0.1:${FAKE_PORT}/v1`,
    MOCK_LLM: "",
  },
  stdio: "ignore",
  detached: true,
});
const stop = () => { try { process.kill(-app.pid); } catch {} fake.close(); };

async function post(path, payload) {
  const res = await fetch(`http://127.0.0.1:${APP_PORT}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, json: await res.json() };
}
const remix = (slideText, extra = {}) => post("/api/remix", { slideText, caption: "원본 캡션", ...extra });
const last = () => requests.at(-1);

try {
  for (let i = 0; ; i++) {
    try { await fetch(`http://127.0.0.1:${APP_PORT}/`); break; } catch {}
    if (i > 40) throw new Error("앱 서버가 뜨지 않음");
    await new Promise((r) => setTimeout(r, 500));
  }

  const tinyJpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";
  // 가짜 서버가 시나리오를 고를 수 있도록 사진 바이트 안에 CASE 표시를 넣은 테스트용 사진
  const photo = (c) => `data:image/jpeg;base64,${Buffer.from(`\xff\xd8CASE:${c}`).toString("base64")}`;
  const cases = [
    ["각색 정상 → 슬라이드·캡션 + 고지 문구", () => remix("CASE:ok"), (r) => {
      assert.equal(r.status, 200);
      assert.equal(r.json.slides.length, 2);
      assert.equal(r.json.slides[0].title, good.slides[0].title);
      assert.match(r.json.caption, /쿠팡 파트너스 활동의 일환/);
      const { path, body } = last();
      assert.equal(path, "/v1/responses");
      assert.equal(body.model, "gpt-5-mini");
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      assert.equal(body.reasoning.effort, "low");
      assert.ok(body.max_output_tokens <= 8000);
      assert.ok(body.instructions.includes("각색 원칙"));
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
    ["AI 새 사진: 원본 사진 편집 요청", () => post("/api/image-gen", { image: photo("image"), title: "제목" }), (r) => {
      assert.equal(r.status, 200);
      assert.match(r.json.image, /^data:image\/jpeg;base64,/);
      const { path, body, contentType } = last();
      assert.equal(path, "/v1/images/edits");
      assert.match(contentType, /^multipart\/form-data/);
      const field = (name) => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`))?.[1];
      assert.equal(field("model"), "gpt-image-2.5-sunburst");
      assert.equal(field("size"), "1088x1360"); // 정확히 4:5
      assert.equal(field("quality"), "low");
      assert.equal(field("n"), "1");
      assert.match(body, /name="image"; filename="slide\.jpeg"/);
      assert.ok(body.includes("CASE:image"), "원본 사진 바이트가 그대로 전송돼야 함");
      const prompt = field("prompt");
      assert.match(prompt, /same food/i);
      assert.match(prompt, /composition, arrangement of the food, camera angle and plating/);
      assert.match(prompt, /REMOVE ALL TEXT/);
      assert.match(prompt, /\[광고\]/);
      assert.match(prompt, /워터마크·\[광고\] 라벨을 완전히 제거하고, 글자가 하나도 없는 깨끗한 음식 사진/);
    }],
    ["AI 새 사진: 사진 없는 장은 글로 생성", () => post("/api/image-gen", { title: "휴대용 선풍기" }), (r) => {
      assert.equal(r.status, 200);
      const { path, body } = last();
      assert.equal(path, "/v1/images/generations");
      assert.equal(body.model, "gpt-image-2.5-sunburst");
      assert.equal(body.size, "1088x1360");
      assert.match(body.prompt, /REMOVE ALL TEXT/);
    }],
    ["AI 새 사진: 한도 소진", () => post("/api/image-gen", { image: photo("quota") }), (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /사용 한도/); }],
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
