"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CHARACTER_LINEUP_PATH, CHARACTER_WORLD_JA, characterArtPath } from "@/lib/characters";
import { samplePublicUrl } from "@/lib/samples";
import { studioVideoPath, type StudioCharacter, type StudioShort } from "@/lib/studio";
import { Art, Notice, api, apiGet, errorText, exists, withVersion } from "./_ui";

// スタジオのホーム：キャラ一覧とショート一覧、それぞれの進み具合。ここからキャラ登録・ショート作成へ進む（2026-10-19）
export default function StudioHome() {
  const [characters, setCharacters] = useState<StudioCharacter[] | null>(null);
  const [shorts, setShorts] = useState<StudioShort[] | null>(null);
  const [art, setArt] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [c, s] = await Promise.all([apiGet("/api/admin/studio/characters"), apiGet("/api/admin/studio/shorts")]);
      setCharacters(c.characters);
      setShorts(s.shorts);
      // 絵・動画ができているかを調べる（公開URLに HEAD）
      const checks: [string, string | null][] = [];
      for (const x of c.characters as StudioCharacter[]) {
        checks.push([`sheet:${x.id}`, samplePublicUrl(characterArtPath(x.id, "sheet"))]);
        checks.push([`faces:${x.id}`, samplePublicUrl(characterArtPath(x.id, "faces"))]);
      }
      for (const x of s.shorts as StudioShort[]) {
        checks.push([`a:${x.id}`, samplePublicUrl(studioVideoPath(x.id, "a"))]);
        checks.push([`full:${x.id}`, samplePublicUrl(studioVideoPath(x.id, "full"))]);
      }
      const results = await Promise.all(checks.map(async ([k, u]) => [k, await exists(u)] as const));
      setArt(Object.fromEntries(results));
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, []);

  async function importSeeds() {
    setBusy(true);
    setError(null);
    try {
      const r = await api("/api/admin/studio/characters", { action: "import" });
      setStatus(`取り込みました（キャラ ${r.characters} 体・ショート ${r.shorts} 本）`);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function makeLineup() {
    setBusy(true);
    setError(null);
    setStatus("全員の並びを作成中…（1〜2分）");
    try {
      const r = await api("/api/admin/studio/characters", { action: "lineup" });
      setStatus(`並びができました（${r.seconds}秒）`);
      setLineup(r.url);
    } catch (e) {
      setError(errorText(e));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }
  const [lineup, setLineup] = useState<string | null>(() => withVersion(samplePublicUrl(CHARACTER_LINEUP_PATH)));

  const charName = (id: string | null) => characters?.find((c) => c.id === id)?.name ?? "（キャラ未選択）";

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 24 }}>
      <a href="/admin">← 注文管理へ</a>
      <div>
        <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>スタジオ「おちばの したの まち」</h1>
        <p className="step-lead" style={{ marginTop: 8 }}>
          キャラの登録 → 設定画・表情集 → ショートの台本（AIとヒアリング）→ 絵 → 動画（約15秒）まで、ここで作ります。お客様の画面には出ません。
        </p>
      </div>
      <Notice status={status} error={error} />

      <section className="card" style={{ gap: 10 }}>
        <strong>世界観とタッチ（全キャラ共通）</strong>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
          {CHARACTER_WORLD_JA.map((t) => <li key={t}>{t}</li>)}
          <li>絵のタッチ：やわらかい手描きの水彩と色鉛筆、紙の質感、湿った森の色味。全キャラ・全ショートで同じ指示を使い、ショートの最後のコマは最初のコマを参照して描きます。</li>
          <li>動画：セリフなし。キャラごとの鳴き声と動きだけ。文字・吹き出しなし。</li>
        </ul>
      </section>

      <section className="card" style={{ gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <strong style={{ fontSize: 18 }}>キャラクター（{characters?.length ?? "…"}体）</strong>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="cta" href="/admin/studio/characters/new" style={{ padding: "8px 16px" }}>＋ キャラを登録</Link>
            <button type="button" className="cta yellow" onClick={makeLineup} disabled={busy} style={{ padding: "8px 16px" }}>全員の並びを作る</button>
          </div>
        </div>
        {characters && characters.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
            <p style={{ margin: 0 }}>まだキャラがありません。これまでの6体と「かじっていい？」を取り込めます。</p>
            <button type="button" className="cta" onClick={importSeeds} disabled={busy} style={{ maxWidth: 320 }}>{busy ? "取り込み中…" : "6体とショート1本を取り込む"}</button>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {characters?.map((c) => (
            <a key={c.id} href={`/admin/studio/characters/${c.id}`} style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: 6, padding: 10, border: "1px solid #eee", borderRadius: 12 }}>
              <Art src={withVersion(samplePublicUrl(characterArtPath(c.id, "sheet")))} alt={`${c.name}の設定画`} />
              <strong>{c.name}<span style={{ fontWeight: 400, color: "#666", fontSize: 13 }}>　{c.base}</span></strong>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", fontSize: 12 }}>
                <Badge ok={Boolean(c.design)}>設定</Badge>
                <Badge ok={art[`sheet:${c.id}`]}>設定画</Badge>
                <Badge ok={art[`faces:${c.id}`]}>表情集</Badge>
              </div>
            </a>
          ))}
        </div>
        {characters && characters.length >= 2 && (
          <details>
            <summary style={{ cursor: "pointer", fontSize: 14 }}>全員の並び（大きさの比較・統一感の確認）</summary>
            <div style={{ maxWidth: 720, marginTop: 8 }}><Art src={lineup} alt="全員の並び" /></div>
          </details>
        )}
      </section>

      <section className="card" style={{ gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <strong style={{ fontSize: 18 }}>ショート動画（{shorts?.length ?? "…"}本）</strong>
          <Link className="cta" href="/admin/studio/shorts/new" style={{ padding: "8px 16px" }}>＋ ショートを作る</Link>
        </div>
        {shorts && shorts.length === 0 && <p style={{ margin: 0, fontSize: 14 }}>まだありません。「＋ ショートを作る」からキャラを選んで、ねらいを一言書くところから始めます。</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shorts?.map((s) => (
            <a key={s.id} href={`/admin/studio/shorts/${s.id}`} style={{ textDecoration: "none", color: "inherit", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "10px 12px", border: "1px solid #eee", borderRadius: 12 }}>
              <strong style={{ minWidth: 140 }}>{s.title || "（題名なし）"}</strong>
              <span className="tag">{charName(s.characterId)}</span>
              <span style={{ display: "flex", gap: 4, flexWrap: "wrap", fontSize: 12 }}>
                <Badge ok={Boolean(s.premise)}>ねらい</Badge>
                <Badge ok={Boolean(s.clips[0]?.motion)}>台本</Badge>
                <Badge ok={art[`a:${s.id}`]}>A 8秒</Badge>
                <Badge ok={art[`full:${s.id}`]}>完成15秒</Badge>
              </span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#888" }}>{s.createdAt?.slice(0, 10)}</span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

function Badge({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return <span className="tag" style={{ background: ok ? "#dff3df" : "#f1efe9", color: ok ? "#1f6b2a" : "#999" }}>{ok ? "✓ " : "○ "}{children}</span>;
}
