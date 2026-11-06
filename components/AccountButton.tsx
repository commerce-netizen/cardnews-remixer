"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { pullUserData, signedOut } from "@/lib/cloud-sync";
import { supabaseBrowser } from "@/lib/supabase/client";

/** 오른쪽 위: 로그인 전엔 '로그인', 로그인하면 '마이페이지' (로그인 기능이 꺼져 있으면 안 보임) */
export default function AccountButton() {
  const sb = supabaseBrowser();
  const path = usePathname();
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!sb) return;
    let pulled = false;
    const on = (e: string | null) => {
      setEmail(e);
      if (e && !pulled) {
        pulled = true;
        void pullUserData();
      }
      if (!e) {
        pulled = false;
        signedOut();
      }
    };
    sb.auth.getUser().then(({ data }) => on(data.user?.email ?? null));
    const { data } = sb.auth.onAuthStateChange((_ev, session) => on(session?.user?.email ?? null));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  if (!sb || email === undefined) return null;
  if (!email) {
    return (
      <Link className={`account-btn${path === "/login" ? " on" : ""}`} href={`/login?next=${encodeURIComponent(path || "/")}`}>
        로그인
      </Link>
    );
  }
  return (
    <Link className={`account-btn${path === "/mypage" ? " on" : ""}`} href="/mypage" title={email}>
      <span className="account-dot">{email[0]?.toUpperCase()}</span>
      마이페이지
    </Link>
  );
}
