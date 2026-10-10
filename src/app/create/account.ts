"use client";

import { useCallback, useEffect, useState } from "react";

export type Account =
  | { configured: false; loggedIn: false }
  | { configured: true; loggedIn: false }
  | { configured: true; loggedIn: true; email: string | null; remaining: number; free: number; credits: number; limit: number };

/** ログイン状態とプレビューの残り枚数（今月の無料枠＋追加枠）。読み込み中は null。 */
export function useAccount() {
  const [account, setAccount] = useState<Account | null>(null);
  const refresh = useCallback(() => {
    fetch("/api/account", { cache: "no-store" })
      .then((r) => r.json())
      .then(setAccount)
      .catch(() => setAccount((a) => a ?? { configured: false, loggedIn: false }));
  }, []);
  useEffect(refresh, [refresh]);
  return [account, setAccount, refresh] as const;
}

export function loginHref(next: string) {
  return `/login?next=${encodeURIComponent(next)}`;
}
