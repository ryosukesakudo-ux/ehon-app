"use client";

import { useState } from "react";
import { SHOWCASE_PHOTO, samplePublicUrl } from "@/lib/samples";
import { SERIES_NOTE_MAX } from "@/lib/series";
import { TOUCHES, touchImagePath, type TouchId } from "@/lib/touch";

// 開いた時刻を版にして、描き直した絵の古いキャッシュを避ける
const OPENED_AT = typeof window === "undefined" ? 0 : Date.now();

type Result = { image: string; seconds: number };

export default function TouchStudio({ scenes }: { scenes: string[] }) {
  const [scene, setScene] = useState(1);
  const [note, setNote] = useState("");
  const [running, setRunning] = useState<TouchId[]>([]);
  const [results, setResults] = useState<Partial<Record<TouchId, Result>>>({});
  const [errors, setErrors] = useState<Partial<Record<TouchId, string>>>({});
  const photo = samplePublicUrl(SHOWCASE_PHOTO);

  async function draw(touch: TouchId) {
    setRunning((r) => [...r, touch]);
    setErrors((e) => ({ ...e, [touch]: undefined }));
    try {
      const res = await fetch("/api/admin/touch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ touch, scene, note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `失敗しました (${res.status})`);
      setResults((r) => ({ ...r, [touch]: { image: json.image, seconds: json.seconds } }));
    } catch (e) {
      setErrors((r) => ({ ...r, [touch]: e instanceof Error ? e.message : "失敗しました" }));
    } finally {
      setRunning((r) => r.filter((t) => t !== touch));
    }
  }

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <a href="/admin">← 注文管理へ</a>
      <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>タッチ試作</h1>
      <p className="step-lead">
        手描き風の3つのタッチで、作例の家族写真から森1話の同じ場面を描いて見比べます（中画質 1枚 約8円）。
        お客様の画面には出ません。タッチごとに最後の1枚だけ残ります。
      </p>
      {photo && (
        <figure style={{ margin: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 元にする写真の確認用 */}
          <img src={`${photo}?v=${OPENED_AT}`} alt="作例の家族写真" style={{ width: 240, maxWidth: "100%", borderRadius: 12 }} />
          <figcaption>元にする写真（作例スタジオの①）</figcaption>
        </figure>
      )}
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        場面（森1話）
        <select value={scene} onChange={(e) => setScene(Number(e.target.value))}>
          {scenes.map((label, i) => (
            <option key={i} value={i + 1}>
              場面{i + 1}：{label}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        追加の指示（任意・日本語でOK）
        <textarea value={note} maxLength={SERIES_NOTE_MAX} rows={2} onChange={(e) => setNote(e.target.value)} placeholder="例：線をもっと太く、背景はもっと少なく" />
      </label>
      <button type="button" className="cta" onClick={() => TOUCHES.forEach((t) => draw(t.id))} disabled={running.length > 0} style={{ maxWidth: 360 }}>
        {running.length > 0 ? "作成中…（1〜2分）" : "3つのタッチでまとめて描く"}
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {TOUCHES.map((t) => {
          const r = results[t.id];
          const saved = samplePublicUrl(touchImagePath(t.id));
          const busy = running.includes(t.id);
          return (
            <figure key={t.id} style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <strong>{t.label}</strong>
              <span style={{ fontSize: 14 }}>{t.lead}</span>
              {r ? (
                // eslint-disable-next-line @next/next/no-img-element -- 作った絵をそのまま表示
                <img src={r.image} alt={t.label} style={{ width: "100%", borderRadius: 12 }} />
              ) : saved ? (
                // eslint-disable-next-line @next/next/no-img-element -- 前に作った絵（無ければ消える）
                <img src={`${saved}?v=${OPENED_AT}`} alt={t.label} style={{ width: "100%", borderRadius: 12 }} onError={(e) => (e.currentTarget.style.display = "none")} />
              ) : null}
              {r && <figcaption>{r.seconds}秒</figcaption>}
              {errors[t.id] && <p style={{ color: "#c0392b", margin: 0 }}>{errors[t.id]}</p>}
              <button type="button" onClick={() => draw(t.id)} disabled={busy}>
                {busy ? "作成中…" : "このタッチだけ描く"}
              </button>
            </figure>
          );
        })}
      </div>
    </main>
  );
}
