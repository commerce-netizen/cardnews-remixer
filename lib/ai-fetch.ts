/**
 * 브라우저 → 우리 서버 AI 요청 도우미.
 *
 * 'AI 사용량 한도' 오류의 대부분은 잔액 문제가 아니라 **1분당 한도** — 한 번 만들 때 사진 10장·장별 글 10개를
 * 한꺼번에 보내서 생겼다(OpenAI 계정 등급이 낮으면 사진은 1분에 몇 장밖에 안 됨).
 * 그래서 ① 동시에 보내는 개수를 묶고(pool) ② 429(분당 한도)를 받으면 잠깐 쉬었다 다시 보낸다.
 * 402(잔액·월 한도)는 기다려도 안 풀리니 바로 알린다.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429면 20초·45초 쉬고 최대 2번 더 보낸다 */
export async function postAi<T>(url: string, body: unknown, fallbackError: string): Promise<T> {
  const waits = [20_000, 45_000];
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data as T;
    if (res.status === 429 && attempt < waits.length) {
      await sleep(waits[attempt]);
      continue;
    }
    throw new Error(data.error || fallbackError);
  }
}

/** items를 한 번에 최대 limit개씩만 돌린다 (순서 유지) */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
