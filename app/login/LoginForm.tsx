"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mode = "login" | "signup";

/** 로그인·회원가입 — 카카오·구글 버튼, 또는 이메일·비밀번호 */
export default function LoginForm() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [info, setInfo] = useState<string | null>(null);

  if (!sb) {
    return (
      <div className="card">
        <h1>로그인</h1>
        <p className="lead" style={{ margin: 0 }}>지금은 로그인 없이 쓰는 상태예요. 바로 <Link href="/">사진 콘텐츠 만들기</Link>로 가세요.</p>
      </div>
    );
  }

  const callback = (to: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(to)}`;

  const social = async (provider: "google" | "kakao") => {
    setError(null);
    setBusy(true);
    const { error: e } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: callback(next) } });
    if (e) {
      setError(`${provider === "kakao" ? "카카오" : "구글"} 로그인을 시작하지 못했어요. 잠시 뒤 다시 눌러 주세요.`);
      setBusy(false);
    }
  };

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("이메일 주소를 확인해 주세요.");
    if (pw.length < 8) return setError("비밀번호는 8자 이상으로 해 주세요.");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: e } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: callback("/mypage") } });
        if (e) throw e;
        if (!data.session) {
          setInfo(`${email} 로 인증 메일을 보냈어요. 메일의 링크를 누르면 가입이 끝나요. (메일이 안 보이면 스팸함도 확인해 주세요)`);
          return;
        }
        router.replace("/mypage");
      } else {
        const { error: e } = await sb.auth.signInWithPassword({ email, password: pw });
        if (e) throw e;
        router.replace(next);
      }
    } catch (e) {
      const msg = (e as Error).message || "";
      setError(
        /Invalid login credentials/i.test(msg)
          ? "이메일이나 비밀번호가 맞지 않아요."
          : /already registered/i.test(msg)
            ? "이미 가입된 이메일이에요. '로그인'으로 들어와 주세요."
            : /Email not confirmed/i.test(msg)
              ? "아직 메일 인증이 안 됐어요. 받은 메일의 링크를 눌러 주세요."
              : "잠시 문제가 생겼어요. 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>{mode === "login" ? "로그인" : "회원가입"}</h1>
      <p className="lead">돈작가 사진 생성기를 쓰려면 {mode === "login" ? "로그인" : "가입"}해 주세요.</p>

      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {info && <div className="notice notice-info" role="status">{info}</div>}

      <div className="card stack">
        <button className="btn btn-kakao btn-huge" onClick={() => social("kakao")} disabled={busy}>
          <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24">
            <path fill="#191919" d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.66 6.66l-.95 3.48c-.08.3.26.55.53.38l4.15-2.74c.53.07 1.07.1 1.61.1 5.52 0 10-3.54 10-7.88S17.52 3 12 3z" />
          </svg>
          카카오로 {mode === "login" ? "로그인" : "시작하기"}
        </button>
        <button className="btn btn-google btn-huge" onClick={() => social("google")} disabled={busy}>
          <svg viewBox="0 0 48 48" aria-hidden="true" width="24" height="24">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
          </svg>
          구글로 {mode === "login" ? "로그인" : "시작하기"}
        </button>

        <div className="or-line"><span>또는 이메일로</span></div>

        <div>
          <label className="field-label" htmlFor="email">이메일</label>
          <input id="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div>
          <label className="field-label" htmlFor="pw">비밀번호 {mode === "signup" && <span className="muted small">(8자 이상)</span>}</label>
          <input
            id="pw"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
          {busy ? "잠시만요…" : mode === "login" ? "이메일로 로그인" : "이메일로 가입하기"}
        </button>
      </div>

      <div style={{ textAlign: "center" }}>
        {mode === "login" ? (
          <button className="link-btn" onClick={() => { setMode("signup"); setError(null); setInfo(null); }}>처음이세요? 이메일로 회원가입</button>
        ) : (
          <button className="link-btn" onClick={() => { setMode("login"); setError(null); setInfo(null); }}>이미 가입했어요 → 로그인</button>
        )}
      </div>
    </div>
  );
}
