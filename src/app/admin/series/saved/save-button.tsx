"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** 「今の13枚を保存版にする」ボタン */
export function SaveButton({ series, episode, title }: { series: string; episode: number; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!confirm(`第${episode}話「${title}」の今の表紙＋12場面（13枚）を保存版にします。よろしいですか？`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/series/saved", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ series, episode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "保存できませんでした");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <button type="button" className="cta" style={{ width: "auto", height: 44, padding: "0 20px", fontSize: 15 }} disabled={busy} onClick={save}>
        {busy ? "保存しています…" : "今の13枚を保存版にする"}
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
