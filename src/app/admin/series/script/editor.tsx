"use client";

import { useEffect, useState } from "react";
import type { Combo, SeriesId } from "@/lib/story-key";

export type ScriptVersion = {
  variant: "main" | Combo;
  /** この文を使う写真の組み合わせ */
  combos: Combo[];
  label: string;
  /** 元の台本の文（少ない・普通・多い） */
  base: string[];
  /** 今の文（直していれば直した文） */
  text: string[];
  updatedAt: string | null;
};

export type ScriptSeries = {
  id: SeriesId;
  name: string;
  single: boolean;
  episodes: { no: number; title: string; scenes: { versions: ScriptVersion[] }[] }[];
};

const COMBO_LABEL: Record<Combo, string> = { both: "ママとパパ", mom: "ママだけ", dad: "パパだけ", none: "子どもだけ" };
const LEVEL_LABEL = ["少ない", "普通", "多い"];

export function ScriptEditor({ list, initialSeries, initialEpisode }: { list: ScriptSeries[]; initialSeries: SeriesId; initialEpisode: number }) {
  const [seriesId, setSeriesId] = useState(initialSeries);
  const series = list.find((s) => s.id === seriesId) ?? list[0];
  const [episodeNo, setEpisodeNo] = useState(initialEpisode);
  const episode = series.episodes.find((e) => e.no === episodeNo) ?? series.episodes[0];

  // 絵スタジオの「文を直す」から来たときは、その場面まで動かす
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <>
      <div className="card" style={{ flexDirection: "row", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }}>
          シリーズ
          <select value={series.id} onChange={(e) => { setSeriesId(e.target.value as SeriesId); setEpisodeNo(1); }}>
            {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }}>
          話
          <select value={episode.no} onChange={(e) => setEpisodeNo(Number(e.target.value))}>
            {series.episodes.map((ep) => <option key={ep.no} value={ep.no}>第{ep.no}話「{ep.title}」</option>)}
          </select>
        </label>
      </div>
      {episode.scenes.map((sc, i) => (
        <section key={`${series.id}/${episode.no}/${i}`} id={`scene-${i + 1}`} className="card" style={{ gap: 12 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 17, color: "var(--navy)" }}>場面{i + 1}</h2>
          {sc.versions.map((v) => (
            <VersionEditor key={v.variant} series={series.id} episode={episode.no} scene={i + 1} version={v} single={series.single} showCombos={sc.versions.length > 1} />
          ))}
        </section>
      ))}
    </>
  );
}

function VersionEditor({ series, episode, scene, version, single, showCombos }: { series: SeriesId; episode: number; scene: number; version: ScriptVersion; single: boolean; showCombos: boolean }) {
  const [text, setText] = useState(version.text);
  const [saved, setSaved] = useState(version.text);
  const [updatedAt, setUpdatedAt] = useState(version.updatedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const levels = single ? [1] : [0, 1, 2];
  const dirty = text.some((t, l) => t !== saved[l]);
  const edited = saved.some((t, l) => t !== version.base[l]);

  async function post(next: string[] | null) {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await fetch("/api/admin/series/script", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ series, episode, scene, variant: version.variant, text: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "保存できませんでした");
      const now = next ? next.map((t) => t.replace(/\r\n?/g, "\n").trim()) : version.base;
      setText(now);
      setSaved(now);
      const back = !next || now.every((t, l) => t === version.base[l]);
      setUpdatedAt(back ? null : new Date().toISOString());
      setDone(back ? "元の台本の文に戻しました" : "保存しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #eee", paddingTop: 8 }}>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
        {showCombos && <strong style={{ color: "var(--navy)" }}>写真が {version.combos.map((c) => COMBO_LABEL[c]).join("・")} のとき　</strong>}
        絵：{version.label}
      </div>
      {levels.map((l) => (
        <label key={l} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          {single ? "本文" : `文の量「${LEVEL_LABEL[l]}」`}
          <textarea
            value={text[l]}
            disabled={busy}
            // 数のお勉強は3つとも同じ文
            onChange={(e) => setText(single ? [e.target.value, e.target.value, e.target.value] : text.map((t, k) => (k === l ? e.target.value : t)))}
            rows={[2, 4, 6][l]}
            style={{ fontFamily: "inherit", fontSize: 14, lineHeight: 1.7, padding: 8, borderRadius: 8, border: text[l] !== saved[l] ? "2px solid var(--coral, #F08A6C)" : "1px solid #ccc", resize: "vertical" }}
          />
        </label>
      ))}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="cta" style={{ width: "auto", height: 40, padding: "0 20px", fontSize: 14 }} disabled={busy || !dirty} onClick={() => post(text)}>
          {busy ? "保存しています…" : "保存"}
        </button>
        {dirty && (
          <button type="button" className="ghost" style={{ width: "auto", height: 40, padding: "0 14px", fontSize: 13 }} disabled={busy} onClick={() => setText(saved)}>
            書いた分を取り消す
          </button>
        )}
        {edited && !dirty && (
          <button
            type="button"
            className="ghost"
            style={{ width: "auto", height: 40, padding: "0 14px", fontSize: 13 }}
            disabled={busy}
            onClick={() => confirm("この場面の文を、直す前の台本の文に戻します。よろしいですか？") && post(null)}
          >
            元の台本に戻す
          </button>
        )}
        {edited && updatedAt && <span className="tag" style={{ background: "#FFE6A6" }}>管理画面で直した文（{new Date(updatedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}）</span>}
        {done && <span style={{ fontSize: 13, color: "#2a8a5a" }}>{done}</span>}
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  );
}
