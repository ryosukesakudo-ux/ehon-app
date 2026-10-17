"use client";

import { useState } from "react";
import { CHARACTER_LINEUP_PATH, CHARACTER_WORLD_JA, ORIGINAL_CHARACTERS, characterArtPath, type CharacterArt, type OriginalCharacter } from "@/lib/characters";
import { samplePublicUrl } from "@/lib/samples";
import { SERIES_NOTE_MAX } from "@/lib/series";

// 開いた時刻を版にして、作り直した絵の古いキャッシュを避ける
const OPENED_AT = typeof window === "undefined" ? 0 : Date.now();

type Job = { kind: CharacterArt | "lineup"; id?: string };

// キャラスタジオ：オリジナルキャラ6体（おちばの したの まち）の設定画・表情・全員の並びを作る。お客様の画面には出ない
export default function CharactersPage() {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [silhouette, setSilhouette] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const key = (j: Job) => `${j.kind}:${j.id ?? ""}`;
  const urlOf = (path: string, k: string) => urls[k] ?? (samplePublicUrl(path) && `${samplePublicUrl(path)}?v=${OPENED_AT}`);

  async function run(j: Job) {
    const k = key(j);
    setRunning(k);
    setError(null);
    try {
      const res = await fetch("/api/admin/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...j, note: notes[j.id ?? "lineup"] ?? "" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `失敗しました (${res.status})`);
      setUrls((u) => ({ ...u, [k]: json.url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setRunning(null);
    }
  }

  const lineupKey = key({ kind: "lineup" });
  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <a href="/admin">← 注文管理へ</a>
      <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>キャラスタジオ「おちばの したの まち」</h1>
      <p className="step-lead">
        オリジナルキャラ6体の設定画（正面・横・後ろ）と4つの表情を作ります（設定画 約25円、表情 約10円）。
        絵は保存され、作り直すと上書きされます。お客様の画面には出ません。
      </p>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
        {CHARACTER_WORLD_JA.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
        <input type="checkbox" checked={silhouette} onChange={(e) => setSilhouette(e.target.checked)} />
        黒塗りのシルエットで見る（形だけで見分けがつくか、既存キャラに似ていないかの確認用）
      </label>
      {error && <p style={{ color: "#c0392b" }}>{error}</p>}

      <section className="card" style={{ gap: 12 }}>
        <strong>全員の並び</strong>
        <Art src={urlOf(CHARACTER_LINEUP_PATH, lineupKey)} alt="6体の並び" silhouette={silhouette} />
        <Note value={notes.lineup ?? ""} onChange={(v) => setNotes((n) => ({ ...n, lineup: v }))} />
        <button type="button" className="cta" onClick={() => run({ kind: "lineup" })} disabled={running !== null} style={{ maxWidth: 360 }}>
          {running === lineupKey ? "作成中…（1〜2分）" : "設定画のあるキャラを並べる"}
        </button>
      </section>

      {ORIGINAL_CHARACTERS.map((c) => (
        <CharacterCard
          key={c.id}
          c={c}
          sheet={urlOf(characterArtPath(c.id, "sheet"), key({ kind: "sheet", id: c.id }))}
          faces={urlOf(characterArtPath(c.id, "faces"), key({ kind: "faces", id: c.id }))}
          silhouette={silhouette}
          note={notes[c.id] ?? ""}
          onNote={(v) => setNotes((n) => ({ ...n, [c.id]: v }))}
          running={running}
          onRun={(kind) => run({ kind, id: c.id })}
        />
      ))}
    </main>
  );
}

function CharacterCard(props: {
  c: OriginalCharacter;
  sheet: string | null;
  faces: string | null;
  silhouette: boolean;
  note: string;
  onNote: (v: string) => void;
  running: string | null;
  onRun: (kind: CharacterArt) => void;
}) {
  const { c } = props;
  const busy = (kind: CharacterArt) => props.running === `${kind}:${c.id}`;
  return (
    <section className="card" style={{ gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
        <strong style={{ fontSize: 20 }}>{c.name}</strong>
        <span className="tag">{c.base}</span>
        <span className="tag">{c.role}</span>
      </div>
      <table style={{ fontSize: 14, lineHeight: 1.7, borderCollapse: "collapse" }}>
        <tbody>
          <Row label="キモ要素">{c.gross}</Row>
          <Row label="性格">{c.personality}</Row>
          <Row label="口ぐせ">「{c.catchphrase}」</Row>
          <Row label="配色">{c.colors}</Row>
        </tbody>
      </table>
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#666" }}>設定画（正面・横・後ろ）</span>
          <Art src={props.sheet} alt={`${c.name}の設定画`} silhouette={props.silhouette} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#666" }}>表情（よろこぶ・おこる・こわがる・ねむい）</span>
          <Art src={props.faces} alt={`${c.name}の表情`} silhouette={props.silhouette} />
        </div>
      </div>
      <Note value={props.note} onChange={props.onNote} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="cta" onClick={() => props.onRun("sheet")} disabled={props.running !== null}>
          {busy("sheet") ? "作成中…（1〜2分）" : "設定画を作る"}
        </button>
        <button type="button" className="cta yellow" onClick={() => props.onRun("faces")} disabled={props.running !== null}>
          {busy("faces") ? "作成中…（1〜2分）" : "表情を作る（設定画から）"}
        </button>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <th style={{ textAlign: "left", paddingRight: 12, whiteSpace: "nowrap", verticalAlign: "top", color: "#666", fontWeight: 600 }}>{label}</th>
      <td>{children}</td>
    </tr>
  );
}

function Note({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
      追加の指示（任意・日本語でOK。次に作る1枚にだけ効きます）
      <textarea value={value} maxLength={SERIES_NOTE_MAX} rows={2} onChange={(e) => onChange(e.target.value)} placeholder="例：もっと歯を大きく、目をもっと小さく" />
    </label>
  );
}

// 保存された絵。まだ無いときは「未作成」。シルエット表示は黒く塗りつぶす
function Art({ src, alt, silhouette }: { src: string | null; alt: string; silhouette: boolean }) {
  const [missing, setMissing] = useState(false);
  if (!src || missing) {
    return <div style={{ aspectRatio: "3 / 2", borderRadius: 12, background: "#f1efe9", display: "grid", placeItems: "center", color: "#888", fontSize: 13 }}>{src ? "未作成" : "Supabase 未設定"}</div>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 作った絵をそのまま表示
    <img key={src} src={src} alt={alt} onError={() => setMissing(true)} style={{ width: "100%", borderRadius: 12, filter: silhouette ? "grayscale(1) brightness(0.6) contrast(50)" : undefined }} />
  );
}
