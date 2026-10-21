"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** いらない保存版を消すボタン（今の見本には影響しない） */
export function DeleteSavedButton({ series, episode, stamp, label }: { series: string; episode: number; stamp: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (!confirm(`保存版 ${label} を削除します。絵13枚とメモが消え、元に戻せません（今の見本はそのままです）。よろしいですか？`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/series/saved", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "delete", series, episode, stamp }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "削除できませんでした");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除できませんでした");
      setBusy(false);
    }
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <button type="button" className="ghost" style={{ width: "auto", height: 30, padding: "0 10px", fontSize: 12, color: "#b3261e" }} disabled={busy} onClick={remove}>
        {busy ? "削除しています…" : "この保存版を削除"}
      </button>
      {error && <span className="error">{error}</span>}
    </span>
  );
}
