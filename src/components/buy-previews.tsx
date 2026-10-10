"use client";

import { useState } from "react";
import { PREVIEW_PACK, yen } from "@/lib/catalog";

/** プレビューの追加枠を買うボタン。Stripe の決済画面へ移り、終わったら returnTo に戻る。 */
export function BuyPreviewsButton({ returnTo, className = "ghost" }: { returnTo: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "購入画面を開けませんでした");
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "購入画面を開けませんでした");
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={buy}>
        {busy ? "購入画面を開いています…" : `プレビューを${PREVIEW_PACK.credits}枚追加（${yen(PREVIEW_PACK.price)}）`}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
