"use client";

import { useState } from "react";

/** 保存版の1枚（または一式全体）に、直してほしい点のメモを書く欄 */
export function SavedNote({ series, episode, stamp, page, initial, max, placeholder }: { series: string; episode: number; stamp: string; page: number | "all"; initial: string; max: number; placeholder: string }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/series/saved", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "note", series, episode, stamp, page, text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "保存できませんでした");
      setSaved(text.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }
  const changed = text.trim() !== saved;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <textarea value={text} maxLength={max} rows={page === "all" ? 3 : 2} placeholder={placeholder} onChange={(e) => setText(e.target.value)} style={{ width: "100%", fontSize: 13, padding: 6, borderRadius: 6, border: "1px solid #ccc", resize: "vertical" }} />
      <button type="button" className="ghost" style={{ width: "auto", height: 32, padding: "0 12px", fontSize: 13, alignSelf: "flex-start" }} disabled={busy || !changed} onClick={save}>
        {busy ? "保存中…" : changed ? "メモを保存" : saved ? "保存済み" : "メモを保存"}
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
