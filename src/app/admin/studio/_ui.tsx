"use client";

import { useState } from "react";

// スタジオ共通の小さな部品（/admin/studio 配下だけで使う）

// 開いた時刻を版にして、作り直した絵・動画の古いキャッシュを避ける
export const OPENED_AT = typeof window === "undefined" ? 0 : Date.now();
export function withVersion(url: string | null) {
  return url && `${url}?v=${OPENED_AT}`;
}

export async function api(path: string, body: Record<string, unknown>) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `失敗しました (${res.status})`);
  return json;
}

export async function apiGet(path: string) {
  const res = await fetch(path);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `失敗しました (${res.status})`);
  return json;
}

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : "失敗しました";
}

/** 保存された絵。まだ無いときは「未作成」 */
export function Art({ src, alt, ratio = "3 / 2", silhouette }: { src: string | null; alt: string; ratio?: string; silhouette?: boolean }) {
  const [missing, setMissing] = useState(false);
  if (!src || missing) return <Empty ratio={ratio}>{src ? "未作成" : "Supabase 未設定"}</Empty>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 作った絵をそのまま表示
    <img key={src} src={src} alt={alt} onError={() => setMissing(true)} style={{ width: "100%", borderRadius: 12, background: "#f1efe9", filter: silhouette ? "grayscale(1) brightness(0.6) contrast(50)" : undefined }} />
  );
}

/** 保存された動画。まだ無いときは「未作成」 */
export function VideoBox({ src, ratio = "9 / 16" }: { src: string | null; ratio?: string }) {
  const [missing, setMissing] = useState(false);
  if (!src || missing) return <Empty ratio={ratio}>{src ? "未作成" : "Supabase 未設定"}</Empty>;
  return <video key={src} src={src} controls playsInline onError={() => setMissing(true)} style={{ width: "100%", borderRadius: 12, background: "#000" }} />;
}

export function Empty({ children, ratio }: { children: React.ReactNode; ratio: string }) {
  return <div style={{ aspectRatio: ratio, borderRadius: 12, background: "#f1efe9", display: "grid", placeItems: "center", color: "#888", fontSize: 13 }}>{children}</div>;
}

export function Field({ label, hint, value, onChange, rows, maxLength, mono }: { label: string; hint?: string; value: string; onChange: (v: string) => void; rows?: number; maxLength?: number; mono?: boolean }) {
  const style = { fontFamily: mono ? "ui-monospace, monospace" : undefined, fontSize: mono ? 13 : undefined } as const;
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
      <span>{label}</span>
      {rows && rows > 1 ? (
        <textarea value={value} rows={rows} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} placeholder={hint} style={style} />
      ) : (
        <input value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} placeholder={hint} style={style} />
      )}
    </label>
  );
}

export function Notice({ status, error }: { status: string | null; error: string | null }) {
  return (
    <>
      {status && <p style={{ margin: 0, fontSize: 14, color: "#4f6f9f" }}>{status}</p>}
      {error && <p style={{ margin: 0, color: "#c0392b", fontWeight: 700 }}>エラー: {error}</p>}
    </>
  );
}

export function Steps({ items }: { items: { label: string; done: boolean }[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 12 }}>
      {items.map((s) => (
        <span key={s.label} className="tag" style={{ background: s.done ? "#dff3df" : "#f1efe9", color: s.done ? "#1f6b2a" : "#888" }}>
          {s.done ? "✓ " : "○ "}{s.label}
        </span>
      ))}
    </div>
  );
}

// Veo の operation を localStorage に覚えておき、リロードしても確認を続ける
export type StoredOp = { operation: string; started: number };
export function readStore(key: string): StoredOp | null {
  try {
    const raw = localStorage.getItem(key);
    const v = raw && JSON.parse(raw);
    if (v && typeof v.operation === "string" && typeof v.started === "number" && Date.now() - v.started < 60 * 60 * 1000) return v;
  } catch {}
  return null;
}
export function writeStore(key: string, v: StoredOp | null) {
  try {
    if (v) localStorage.setItem(key, JSON.stringify(v));
    else localStorage.removeItem(key);
  } catch {}
}

/** 画像が公開ストレージにあるか（存在確認用。無ければ 404） */
export async function exists(url: string | null) {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
