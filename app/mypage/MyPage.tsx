"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signedOut } from "@/lib/cloud-sync";
import { supabaseBrowser } from "@/lib/supabase/client";

type KeyState = { loggedIn: boolean; email?: string; hasKey?: boolean; last4?: string | null; updatedAt?: string | null };

/** 마이페이지 — 내 계정 + 내 OpenAI API 키(설정) + 로그아웃 */
export default function MyPage() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [st, setSt] = useState<KeyState | null>(null);
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState(false);

  const load = async () => {
    const res = await fetch("/api/me/key");
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) return router.replace("/login?next=/mypage");
    setSt(data);
  };
  useEffect(() => {
    if (sb) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!sb) {
    return (
      <div className="card">
        <h1>마이페이지</h1>
        <p className="lead" style={{ margin: 0 }}>지금은 로그인 없이 쓰는 상태라 마이페이지가 없어요.</p>
      </div>
    );
  }
  if (!st) return <div className="loading"><div className="spinner" /></div>;

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/me/key", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "저장하지 못했어요.");
      setKey("");
      setShow(false);
      setToast("연결 확인 완료! 이제 사진 콘텐츠를 만들 수 있어요.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    await fetch("/api/me/key", { method: "DELETE" });
    setAskDelete(false);
    setToast("키를 지웠어요.");
    await load();
  };

  const logout = async () => {
    await sb.auth.signOut();
    signedOut();
    router.replace("/login");
  };

  return (
    <div>
      <h1>마이페이지</h1>
      <p className="lead">내 계정과 AI 설정을 관리해요.</p>

      {toast && <div className="notice notice-info" role="status">{toast}</div>}
      {error && <div className="notice notice-error" role="alert">{error}</div>}

      <section className="card stack">
        <h2 style={{ margin: 0 }}>내 계정</h2>
        <div className="kv"><span>이메일</span><b>{st.email}</b></div>
        <button className="btn btn-secondary" onClick={logout}>로그아웃</button>
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0 }}>설정 · 내 OpenAI API 키</h2>
        <p className="muted small" style={{ margin: 0 }}>
          글 쓰는 규칙과 사진 만드는 방식은 돈작가가 정해 둔 그대로 써서 <b>누가 만들어도 품질이 같아요.</b>
          AI 사용 요금만 <b>내 OpenAI 계정</b>에서 나가요. 키는 암호화해서 저장하고, 화면에는 끝 4자리만 보여요.
        </p>

        {st.hasKey ? (
          <div className="key-status ok">
            <span>✓ 연결됨</span>
            <b>sk-••••••••{st.last4}</b>
          </div>
        ) : (
          <div className="key-status">아직 키가 없어요. 아래에 넣으면 바로 쓸 수 있어요.</div>
        )}

        <div>
          <label className="field-label" htmlFor="api-key">{st.hasKey ? "새 키로 바꾸기" : "API 키 붙여 넣기"}</label>
          <div className="key-row">
            <input
              id="api-key"
              type={show ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-로 시작하는 키"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setShow((v) => !v)}>{show ? "숨기기" : "보기"}</button>
          </div>
        </div>
        <button className="btn btn-primary btn-block" onClick={save} disabled={busy || !key.trim()}>
          {busy ? "연결 확인 중…" : "연결 확인하고 저장"}
        </button>
        {st.hasKey && !askDelete && (
          <button className="link-btn" style={{ alignSelf: "flex-start" }} onClick={() => setAskDelete(true)}>저장된 키 지우기</button>
        )}
        {askDelete && (
          <div className="notice notice-error" style={{ margin: 0 }}>
            <p style={{ margin: "0 0 12px" }}>키를 지우면 다시 넣기 전까지 만들기를 못 해요. 지울까요?</p>
            <div className="row">
              <button className="btn btn-secondary" onClick={() => setAskDelete(false)}>아니요</button>
              <button className="btn btn-primary" onClick={remove}>네, 지울래요</button>
            </div>
          </div>
        )}

        <details>
          <summary className="muted" style={{ cursor: "pointer", padding: "6px 0" }}>API 키는 어디서 받나요?</summary>
          <ol className="guide">
            <li><a href="https://platform.openai.com/signup" target="_blank" rel="noreferrer">platform.openai.com</a> 에 가입·로그인</li>
            <li>왼쪽 <b>Billing(결제)</b>에서 카드 등록 후 5~10달러 충전</li>
            <li><b>Limits(한도)</b>에서 월 사용 한도를 정해 두면 안심이에요</li>
            <li><a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">API keys</a> → <b>Create new secret key</b> → 나온 키를 복사해서 위 칸에 붙여 넣기</li>
          </ol>
          <p className="muted small" style={{ margin: 0 }}>대략 게시물 1개(4장, 사진 포함)에 수십~백 원대예요. 사진 없이 글만이면 훨씬 적어요.</p>
        </details>
      </section>

      <div style={{ textAlign: "center" }}>
        <Link className="link-btn" href="/">← 사진 콘텐츠 만들기로</Link>
      </div>
    </div>
  );
}
