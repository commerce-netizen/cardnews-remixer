// /api/remix 응답 처리 테스트 (AI 키 불필요)
// 실제 Claude Messages API와 같은 모양의 응답을 돌려주는 가짜 서버를 띄우고,
// ANTHROPIC_BASE_URL로 앱을 그쪽에 연결해 파싱·스키마·오류 처리 경로를 확인한다.
// 사용법: npm run build && npm run test:remix
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

function message(content, stop_reason = "end_turn", extra = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
    ...extra,
  };
}

// 요청 본문에 들어 있는 CASE 표시로 시나리오 선택
const scenarios = {
  ok: () => [200, message([
    { type: "thinking", thinking: "", signature: "sig" },
    { type: "text", text: JSON.stringify(good) },
  ])],
  refusal: () => [200, message([], "refusal", { stop_details: { type: "refusal", category: null, explanation: null } })],
  truncated: () => [200, message([{ type: "text", text: '{"slides":[{"original":"a","ti' }], "max_tokens")],
  empty: () => [200, message([{ type: "text", text: JSON.stringify({ slides: [], caption: "x" }) }])],
  ratelimit: () => [429, { type: "error", error: { type: "rate_limit_error", message: "rate limited" } }],
  badkey: () => [401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }],
};

let lastRequest = null;
const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    lastRequest = JSON.parse(body || "{}");
    const name = body.match(/CASE:(\w+)/)?.[1] ?? "ok";
    const [status, json] = scenarios[name]();
    res.writeHead(status, { "content-type": "application/json", "retry-after": "0", "x-should-retry": "false" });
    res.end(JSON.stringify(json));
  });
});
await new Promise((r) => fake.listen(FAKE_PORT, r));

const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
  env: { ...process.env, ANTHROPIC_API_KEY: "test-key", ANTHROPIC_BASE_URL: `http://127.0.0.1:${FAKE_PORT}`, MOCK_LLM: "" },
  stdio: "ignore",
  detached: true,
});
const stop = () => { try { process.kill(-app.pid); } catch {} fake.close(); };

async function remix(slideText) {
  const res = await fetch(`http://127.0.0.1:${APP_PORT}/api/remix`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slideText, caption: "원본 캡션" }),
  });
  return { status: res.status, json: await res.json() };
}

try {
  for (let i = 0; ; i++) {
    try { await fetch(`http://127.0.0.1:${APP_PORT}/`); break; } catch {}
    if (i > 40) throw new Error("앱 서버가 뜨지 않음");
    await new Promise((r) => setTimeout(r, 500));
  }

  const cases = [
    ["정상 응답 → 슬라이드·캡션 + 고지 문구", "CASE:ok", (r) => {
      assert.equal(r.status, 200);
      assert.equal(r.json.slides.length, 2);
      assert.equal(r.json.slides[0].title, good.slides[0].title);
      assert.match(r.json.caption, /쿠팡 파트너스 활동의 일환/);
      // 요청 형식: 모델, 구조화 출력 스키마, 시스템 프롬프트
      assert.equal(lastRequest.model, "claude-opus-5-5");
      assert.equal(lastRequest.output_config.format.type, "json_schema");
      assert.ok(lastRequest.system.includes("각색 원칙"));
    }],
    ["거절(refusal)", "CASE:refusal", (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /거절/); }],
    ["잘린 JSON(max_tokens)", "CASE:truncated", (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /다시 한 번/); }],
    ["빈 슬라이드", "CASE:empty", (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /다시 한 번/); }],
    ["429 사용량 초과", "CASE:ratelimit", (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /1분 뒤/); }],
    ["401 잘못된 키", "CASE:badkey", (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /키가 올바르지/); }],
    ["입력 없음", "", (r) => { assert.equal(r.status, 502); assert.match(r.json.error, /필요해요/); }],
  ];

  let failed = 0;
  for (const [name, text, check] of cases) {
    const r = await remix(text);
    try { check(r); console.log(`✓ ${name}`); }
    catch (e) { failed++; console.log(`✗ ${name}\n  ${e.message}\n  응답: ${JSON.stringify(r)}`); }
  }
  process.exitCode = failed ? 1 : 0;
} finally {
  stop();
}
