"use client";

/**
 * 로그인했을 때 내 템플릿·즐겨찾기를 계정에 저장하고 불러온다.
 * 화면은 지금처럼 이 브라우저 저장소(localStorage)를 읽고, 바뀔 때마다 계정에도 올린다.
 */
const KEYS = { templates: "cardnews.templates.v1", favorites: "cardnews.favorites.v1", active: "cardnews.template.active" };
export const DATA_EVENT = "cardnews:data";

let signedIn = false;
let timer: ReturnType<typeof setTimeout> | null = null;

const read = (k: string, fallback: unknown) => {
  try {
    return JSON.parse(localStorage.getItem(k) || "null") ?? fallback;
  } catch {
    return fallback;
  }
};

async function push(): Promise<void> {
  if (!signedIn) return;
  await fetch("/api/me/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      templates: read(KEYS.templates, []),
      favorites: read(KEYS.favorites, []),
      active_template: localStorage.getItem(KEYS.active),
    }),
  }).catch(() => {});
}

/** 템플릿·즐겨찾기를 저장할 때마다 부른다 (1초 모아서 한 번에) */
export function schedulePush(): void {
  if (!signedIn || typeof window === "undefined") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void push(), 1000);
}

/** 로그인 직후 — 계정에 저장된 걸 받아 온다. 계정이 비어 있으면 이 브라우저 것을 올린다 */
export async function pullUserData(): Promise<void> {
  signedIn = true;
  const res = await fetch("/api/me/data").catch(() => null);
  if (!res?.ok) return;
  const { data } = (await res.json().catch(() => ({}))) as {
    data?: { templates: unknown[]; favorites: unknown[]; active_template: string | null } | null;
  };
  if (!data || (!data.templates?.length && !data.favorites?.length)) {
    await push();
    return;
  }
  try {
    localStorage.setItem(KEYS.templates, JSON.stringify(data.templates ?? []));
    localStorage.setItem(KEYS.favorites, JSON.stringify(data.favorites ?? []));
    if (data.active_template) localStorage.setItem(KEYS.active, data.active_template);
  } catch {}
  window.dispatchEvent(new Event(DATA_EVENT));
}

export function signedOut(): void {
  signedIn = false;
}
