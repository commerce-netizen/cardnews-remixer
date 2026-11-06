"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Member = {
  id: string;
  email: string;
  provider: string;
  createdAt: string;
  lastSignIn: string | null;
  status: "admin" | "active" | "blocked" | "none";
  joinedAt: string | null;
  hasKey: boolean;
};
type Filter = "all" | "active" | "none" | "blocked";
const FILTER_LABEL: Record<Filter, string> = { all: "전체", active: "이용 중", none: "코드 미입력", blocked: "내보냄" };
const STATUS_LABEL: Record<Member["status"], string> = { admin: "관리자", active: "이용 중", none: "코드 미입력", blocked: "내보냄" };

const day = (iso: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** 관리자 모드 — 시크릿 코드 관리 + 가입한 사람 관리(내보내기·다시 허용·삭제) */
export default function AdminPanel() {
  const [denied, setDenied] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [code, setCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [ask, setAsk] = useState<{ id: string; action: "block" | "delete" } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 2500);
  };

  const load = async () => {
    const [mr, sr] = await Promise.all([fetch("/api/admin/members"), fetch("/api/admin/settings")]);
    if (!mr.ok) {
      const d = await mr.json().catch(() => ({}));
      setDenied(d.error || "관리자만 볼 수 있어요.");
      return;
    }
    setMembers((await mr.json()).members);
    if (sr.ok) setCode((await sr.json()).inviteCode);
  };
  useEffect(() => {
    void load();
  }, []);

  const saveCode = async (body: { code?: string; regenerate?: boolean }) => {
    setError(null);
    const res = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setError(d.error || "저장하지 못했어요.");
    setCode(d.inviteCode);
    setNewCode("");
    say("시크릿 코드를 바꿨어요. 이미 들어온 분들은 그대로 이용할 수 있어요.");
  };

  const act = async (id: string, action: "block" | "allow" | "delete") => {
    setError(null);
    const res = await fetch("/api/admin/members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: id, action }) });
    const d = await res.json().catch(() => ({}));
    setAsk(null);
    if (!res.ok) return setError(d.error || "처리하지 못했어요.");
    say(action === "block" ? "내보냈어요. 이제 이 계정은 만들기를 못 해요." : action === "allow" ? "다시 이용할 수 있게 했어요." : "계정을 완전히 지웠어요.");
    await load();
  };

  const counts = useMemo(() => {
    const c = { all: 0, active: 0, none: 0, blocked: 0 } as Record<Filter, number>;
    for (const m of members ?? []) {
      c.all++;
      if (m.status === "active" || m.status === "admin") c.active++;
      else c[m.status]++;
    }
    return c;
  }, [members]);

  const shown = (members ?? []).filter(
    (m) =>
      (filter === "all" || (filter === "active" ? m.status === "active" || m.status === "admin" : m.status === filter)) &&
      (!q.trim() || m.email.toLowerCase().includes(q.trim().toLowerCase())),
  );

  if (denied) {
    return (
      <div className="card">
        <h1>관리자 모드</h1>
        <p className="lead" style={{ margin: 0 }}>{denied}</p>
        <Link className="link-btn" href="/mypage">← 마이페이지로</Link>
      </div>
    );
  }
  if (!members) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div>
      <h1>관리자 모드</h1>
      <p className="lead">시크릿 코드를 관리하고, 가입한 분들을 관리해요.</p>

      {toast && <div className="notice notice-info" role="status">{toast}</div>}
      {error && <div className="notice notice-error" role="alert">{error}</div>}

      <section className="card stack">
        <h2 style={{ margin: 0 }}>시크릿 코드</h2>
        <p className="muted small" style={{ margin: 0 }}>이 코드를 아는 사람만 가입 후 이용할 수 있어요. 코드가 퍼졌으면 바꾸세요 — 이미 들어온 분들은 그대로 이용해요.</p>
        <div className="secret-code">
          <b>{code || "(없음)"}</b>
          <button
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {}
            }}
          >
            {copied ? "✓ 복사됨" : "복사"}
          </button>
        </div>
        <div className="key-row">
          <input type="text" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="새 코드 직접 정하기 (4자 이상)" autoComplete="off" style={{ textTransform: "uppercase" }} />
          <button className="btn btn-primary btn-sm" onClick={() => saveCode({ code: newCode })} disabled={newCode.trim().length < 4}>바꾸기</button>
        </div>
        <button className="btn btn-secondary" onClick={() => saveCode({ regenerate: true })}>🎲 새 코드 자동으로 만들기</button>
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0 }}>가입한 분들</h2>
        <div className="seg" role="tablist" aria-label="회원 상태">
          {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {FILTER_LABEL[f]} {counts[f]}
            </button>
          ))}
        </div>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이메일로 찾기" autoComplete="off" />

        {shown.length === 0 ? (
          <p className="muted" style={{ textAlign: "center", margin: "16px 0" }}>해당하는 분이 없어요.</p>
        ) : (
          <div className="member-list">
            {shown.map((m) => (
              <div className="member" key={m.id}>
                <div className="member-main">
                  <b className="member-email">{m.email}</b>
                  <span className={`member-badge s-${m.status}`}>{STATUS_LABEL[m.status]}</span>
                  {m.hasKey && <span className="member-badge s-key">키 등록</span>}
                </div>
                <div className="member-meta">
                  {m.provider === "google" ? "구글" : "이메일"} 가입 {day(m.createdAt)} · 마지막 접속 {day(m.lastSignIn)}
                </div>
                {m.status !== "admin" && (
                  <div className="row">
                    {m.status === "blocked" ? (
                      <button className="btn btn-secondary btn-sm" onClick={() => act(m.id, "allow")}>다시 허용</button>
                    ) : (
                      <button className="btn btn-secondary btn-sm" onClick={() => setAsk({ id: m.id, action: "block" })}>내보내기</button>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={() => setAsk({ id: m.id, action: "delete" })}>계정 삭제</button>
                  </div>
                )}
                {ask?.id === m.id && (
                  <div className="notice notice-error" style={{ margin: "8px 0 0" }}>
                    <p style={{ margin: "0 0 10px" }}>
                      {ask.action === "block"
                        ? <><b>{m.email}</b>을(를) 내보낼까요? 로그인은 돼도 만들기를 못 해요. 나중에 '다시 허용'할 수 있어요.</>
                        : <><b>{m.email}</b> 계정을 완전히 지울까요? 저장한 키·템플릿도 함께 지워지고 되돌릴 수 없어요.</>}
                    </p>
                    <div className="row">
                      <button className="btn btn-secondary btn-sm" onClick={() => setAsk(null)}>아니요</button>
                      <button className="btn btn-primary btn-sm" onClick={() => act(m.id, ask.action)}>{ask.action === "block" ? "네, 내보낼게요" : "네, 지울게요"}</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
