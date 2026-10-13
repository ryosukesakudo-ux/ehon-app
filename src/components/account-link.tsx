"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// トップの上のボタン。ログイン中なら「マイページ」、それ以外は「ログイン」（2026-10-12 作道さん）。
// トップは静的なページなので、ログイン状態は開いたあとに確かめて切り替える。
export function AccountLink({ className }: { className?: string }) {
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    fetch("/api/account")
      .then((r) => r.json())
      .then((j) => setLoggedIn(!!j.loggedIn))
      .catch(() => {});
  }, []);
  return loggedIn ? (
    <Link href="/account" className={className}>マイページ</Link>
  ) : (
    <Link href="/login?next=/account" className={className}>ログイン</Link>
  );
}
