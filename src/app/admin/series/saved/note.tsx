"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 保存版の1枚（または一式全体）に、直してほしい点のメモを書く欄。
 * 1枚ごとの欄には「このメモで今の見本を作り直す」もある（絵スタジオの1枚作り直しと同じ。本番の見本にそのまま出る）
 */
export function SavedNote({
  series,
  episode,
  stamp,
  page,
  initial,
  redrawnAt,
  done,
  max,
  placeholder,
}: {
  series: string;
  episode: number;
  stamp: string;
  page: number | "all";
  initial: string;
  redrawnAt?: string;
  /** Claude が台本に入れたときの説明 */
  done: string | null;
  max: number;
  placeholder: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [redrawn, setRedrawn] = useState(redrawnAt ?? "");
  const [busy, setBusy] = useState<"" | "save" | "redraw">("");
  const [error, setError] = useState("");

  async function post(url: string, body: object) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "うまくいきませんでした");
  }
  async function save() {
    setBusy("save");
    setError("");
    try {
      await post("/api/admin/series/saved", { kind: "note", series, episode, stamp, page, text });
      setSaved(text.trim());
      // 「まとめて作り直す」の枚数とコピーするメモを新しくする
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy("");
    }
  }
  async function redraw() {
    if (page === "all") return;
    if (!confirm(`このメモを指示にして、今の見本の${page === 0 ? "表紙" : `場面${page}`}を作り直します（AI代 約15円）。作り直した絵はすぐ本番の見本に出ます。よろしいですか？`)) return;
    setBusy("redraw");
    setError("");
    try {
      if (text.trim() !== saved) {
        await post("/api/admin/series/saved", { kind: "note", series, episode, stamp, page, text });
        setSaved(text.trim());
      }
      // 絵スタジオと同じ作り方（中画質、場面は横長）
      await post("/api/admin/series", { series, episode, page, note: text.trim(), quality: "preview", wide: page > 0 });
      await post("/api/admin/series/saved", { kind: "redrawn", series, episode, stamp, page });
      setRedrawn(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "作り直せませんでした");
    } finally {
      setBusy("");
    }
  }

  const changed = text.trim() !== saved;
  const small = { width: "auto", height: 32, padding: "0 10px", fontSize: 12 } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <textarea value={text} maxLength={max} rows={page === "all" ? 3 : 2} placeholder={placeholder} onChange={(e) => setText(e.target.value)} style={{ width: "100%", fontSize: 13, padding: 6, borderRadius: 6, border: "1px solid #ccc", resize: "vertical" }} />
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button type="button" className="ghost" style={small} disabled={!!busy || !changed} onClick={save}>
          {busy === "save" ? "保存中…" : changed || !saved ? "メモを保存" : "保存済み"}
        </button>
        {page !== "all" && (
          <button type="button" className="ghost" style={small} disabled={!!busy || !text.trim()} onClick={redraw}>
            {busy === "redraw" ? "作り直しています…" : "このメモで見本を作り直す"}
          </button>
        )}
      </div>
      {redrawn && <span style={{ fontSize: 11, color: "var(--sub)" }}>見本を作り直しました（{new Date(redrawn).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}）</span>}
      {done && <span style={{ fontSize: 11, color: "#2a7a4b" }}>台本に反映済み：{done}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
