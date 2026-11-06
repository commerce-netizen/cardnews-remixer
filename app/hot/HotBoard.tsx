"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { HotData, HotPeriod, HotPost, HotSort } from "@/lib/hot";

const PERIODS: { key: HotPeriod; label: string; hint: string }[] = [
  { key: "day", label: "일일", hint: "모든 게시물을 최근 하루 동안 늘어난 반응 순으로" },
  { key: "week", label: "주간", hint: "모든 게시물을 최근 7일 동안 늘어난 반응 순으로" },
  { key: "month", label: "월간", hint: "모든 게시물을 최근 30일 동안 늘어난 반응 순으로" },
  { key: "all", label: "역대", hint: "모든 게시물을 지금까지 쌓인 반응 순으로" },
];
const SORTS: { key: HotSort; label: string }[] = [
  { key: "likes", label: "❤️ 좋아요 많은 순" },
  { key: "comments", label: "💬 댓글 많은 순" },
];
const SHOW = 300;
const PERIOD_WORD: Record<HotPeriod, string> = { day: "오늘", week: "이번 주", month: "이번 달", all: "누적" };

const fmt = (n: number) =>
  n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}만` : n.toLocaleString("ko-KR");

function ago(iso: string, now: number) {
  const h = Math.floor((now - Date.parse(iso)) / 3_600_000);
  if (h < 1) return "방금 전";
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 31) return `${d}일 전`;
  const dt = new Date(iso);
  return `${dt.getFullYear()}.${dt.getMonth() + 1}.${dt.getDate()}`;
}

const score = (p: HotPost, period: HotPeriod, key: HotSort) => p.gain?.[period]?.[key] ?? p[key];

export default function HotBoard() {
  const router = useRouter();
  const [data, setData] = useState<HotData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<HotPeriod>("day");
  const [sort, setSort] = useState<HotSort>("likes");
  const [account, setAccount] = useState<string>("all");

  useEffect(() => {
    fetch("/api/hot")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setData(j as HotData);
      })
      .catch((e) => setError((e as Error).message || "인기 게시물을 불러오지 못했어요."));
  }, []);

  const list: HotPost[] = useMemo(() => {
    if (!data) return [];
    return (data.lists[period]?.[sort] ?? [])
      .map((c) => data.posts[c])
      .filter((p): p is HotPost => !!p && !!p.thumb && (account === "all" || p.account === account))
      .sort((a, b) => score(b, period, sort) - score(a, period, sort) || b[sort] - a[sort])
      .slice(0, SHOW);
  }, [data, period, sort, account]);

  const now = data ? Date.parse(data.updatedAt) : Date.now();
  const remix = (p: HotPost) => {
    router.push(`/?url=${encodeURIComponent(`https://www.instagram.com/p/${p.code}/`)}`);
  };

  return (
    <>
      <h1>인기 게시물</h1>
      <p className="lead">
        상위 게시물을 매일 모아서, 반응 좋은 순서로 보여 드려요.
        {data && (
          <>
            <br />
            <span className="small">마지막 업데이트: {new Date(data.updatedAt).toLocaleString("ko-KR", { dateStyle: "long", timeStyle: "short" })}</span>
          </>
        )}
      </p>

      <div className="hot-controls">
        <div className="seg hot-periods" role="tablist" aria-label="기간">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              role="tab"
              aria-selected={period === p.key}
              className={period === p.key ? "on" : ""}
              onClick={() => setPeriod(p.key)}
              title={p.hint}
            >
              {p.label} 핫게시물
            </button>
          ))}
        </div>
        <div className="hot-filters">
          <div className="seg" aria-label="정렬">
            {SORTS.map((s) => (
              <button key={s.key} className={sort === s.key ? "on" : ""} onClick={() => setSort(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
          <select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="계정 고르기">
            <option value="all">모든 계정</option>
            {data?.accounts.map((a) => (
              <option key={a.name} value={a.name}>
                @{a.name}
                {a.followers ? ` (팔로워 ${fmt(a.followers)})` : ""}
              </option>
            ))}
          </select>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {PERIODS.find((p) => p.key === period)?.hint} 보여 드려요. 사진 게시물은 인스타가 조회수를 공개하지 않아서 좋아요·댓글로 순위를 매겨요.
        </p>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {!data && !error && (
        <div className="hot-empty">
          <div className="spinner" />
          <p>불러오는 중이에요…</p>
        </div>
      )}
      {data && list.length === 0 && (
        <div className="hot-empty">
          <p>아직 모은 게시물이 없어요. 내일 아침 6시 수집 후 다시 열어 주세요.</p>
        </div>
      )}

      <div className="hot-grid">
        {list.map((p, i) => (
          <article className="hot-card" key={p.code}>
            <div className="hot-thumb">
              {p.thumb ? (
                <img src={`/api/hot/thumb/${p.code}`} alt={(p.caption || "").slice(0, 40)} loading="lazy" />
              ) : (
                <div className="hot-noimg">사진 없음</div>
              )}
              <span className="hot-rank">{i + 1}</span>
              {p.slides > 1 && <span className="hot-slides">▦ {p.slides}장</span>}
              <div className="hot-actions">
                <a
                  className="btn btn-secondary"
                  href={`https://www.instagram.com/p/${p.code}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  게시물 보기 ↗
                </a>
                <button className="btn btn-primary" onClick={() => remix(p)}>
                  각색하기 ▶
                </button>
              </div>
            </div>
            <div className="hot-meta">
              {period !== "all" && (
                <div className="hot-gain">
                  {PERIOD_WORD[period]} {sort === "likes" ? "❤️" : "💬"} +{fmt(score(p, period, sort))}
                </div>
              )}
              <div className="hot-stats">
                <b className={period === "all" && sort === "likes" ? "hl" : ""}>❤️ {fmt(p.likes)}</b>
                <b className={period === "all" && sort === "comments" ? "hl" : ""}>💬 {fmt(p.comments)}</b>
              </div>
              <div className="hot-who">
                @{p.account} · {ago(p.date, now)}
              </div>
              <p className="hot-cap">{p.caption || ""}</p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
