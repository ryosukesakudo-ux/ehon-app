"use client";

import { useEffect, useState } from "react";

export type Account =
  | { configured: false; loggedIn: false }
  | { configured: true; loggedIn: false }
  | { configured: true; loggedIn: true; email: string | null; remaining: number; limit: number };

/** ログイン状態と今月の残り枚数。読み込み中は null。 */
export function useAccount() {
  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => {
    fetch("/api/account")
      .then((r) => r.json())
      .then(setAccount)
      .catch(() => setAccount({ configured: false, loggedIn: false }));
  }, []);
  return [account, setAccount] as const;
}

export function loginHref(next: string) {
  return `/login?next=${encodeURIComponent(next)}`;
}
