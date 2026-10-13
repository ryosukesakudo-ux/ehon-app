"use client";

import { useState } from "react";
import { SHOWCASE_PHOTO, samplePublicUrl } from "@/lib/samples";
import { SERIES_NOTE_MAX } from "@/lib/series";

// 開いた時刻を版にして、作り直した写真の古いキャッシュを避ける
const OPENED_AT = typeof window === "undefined" ? 0 : Date.now();

type Result = { image: string; seconds: number };

// デフォルメ試作：お客様にはまだ出さない絵柄を、作例の家族写真から1枚だけ作って見る（保存はしない）
export default function DeformePage() {
  const [note, setNote] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const photo = samplePublicUrl(SHOWCASE_PHOTO);

  async function start() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/deforme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `失敗しました (${res.status})`);
      setResults((r) => [{ image: json.image, seconds: json.seconds }, ...r]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <a href="/admin">← 注文管理へ</a>
      <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>デフォルメ試作</h1>
      <p className="step-lead">
        大きな丸顔・太い輪郭・点の目・赤いほっぺのデフォルメ調で、作例の家族写真の3人を1枚に描きます（1枚 約25円）。
        お客様の画面には出ません。絵は保存しないので、気に入ったものは長押しや右クリックで保存してください。
      </p>
      {photo && (
        <figure style={{ margin: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 元にする写真の確認用 */}
          <img src={`${photo}?v=${OPENED_AT}`} alt="作例の家族写真" style={{ width: 360, maxWidth: "100%", borderRadius: 12 }} />
          <figcaption>元にする写真（作例スタジオの①）</figcaption>
        </figure>
      )}
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        追加の指示（任意・日本語でOK）
        <textarea value={note} maxLength={SERIES_NOTE_MAX} rows={2} onChange={(e) => setNote(e.target.value)} placeholder="例：もっと頭を大きく、線をもっと太く" />
      </label>
      <button type="button" className="cta" onClick={start} disabled={running} style={{ maxWidth: 360 }}>
        {running ? "作成中…（1〜2分）" : "デフォルメで3人を作る"}
      </button>
      {error && <p style={{ color: "#c0392b" }}>{error}</p>}
      {results.map((r, i) => (
        <figure key={results.length - i} style={{ margin: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 作った絵をそのまま表示 */}
          <img src={r.image} alt="デフォルメの登場人物" style={{ width: "100%", borderRadius: 12 }} />
          <figcaption>{r.seconds}秒</figcaption>
        </figure>
      ))}
    </main>
  );
}
