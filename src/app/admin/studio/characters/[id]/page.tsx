"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { characterArtPath } from "@/lib/characters";
import { samplePublicUrl } from "@/lib/samples";
import { CHARACTER_FIELDS, STUDIO_NOTE_MAX, emptyCharacter, type StudioCharacter } from "@/lib/studio";
import { ShortList } from "../../_shorts";
import { Art, Field, Notice, api, apiGet, errorText, withVersion } from "../../_ui";

// キャラ登録ページ：日本語で設定を書く → AIが英語の指示を書く → 保存 → 設定画 → 表情集（2026-10-19）
export default function CharacterPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = params.id === "new";
  const [c, setC] = useState<StudioCharacter>(emptyCharacter);
  const [loaded, setLoaded] = useState(isNew);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState({ sheet: "", faces: "" });
  const [silhouette, setSilhouette] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);
  const [faces, setFaces] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    apiGet("/api/admin/studio/characters")
      .then((r) => {
        const found = (r.characters as StudioCharacter[]).find((x) => x.id === params.id);
        if (!found) throw new Error("キャラクターが見つかりません");
        setC(found);
        setSheet(withVersion(samplePublicUrl(characterArtPath(found.id, "sheet"))));
        setFaces(withVersion(samplePublicUrl(characterArtPath(found.id, "faces"))));
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoaded(true));
  }, [isNew, params.id]);

  const set = (key: keyof StudioCharacter, v: string) => setC((x) => ({ ...x, [key]: v }));

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(label);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(errorText(e));
      setStatus(null);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<StudioCharacter | null> {
    return run("save", async () => {
      const r = await api("/api/admin/studio/characters", { action: "save", character: c });
      const saved = r.character as StudioCharacter;
      setC(saved);
      setStatus("保存しました");
      if (isNew) router.replace(`/admin/studio/characters/${saved.id}`);
      return saved;
    });
  }

  async function english() {
    await run("english", async () => {
      setStatus("AIが英語の指示を書いています…（30秒ほど）");
      const r = await api("/api/admin/studio/characters", { action: "english", character: c });
      setC((x) => ({ ...x, design: r.design, voice: r.voice, movement: r.movement }));
      setStatus("英語の指示を書きました。内容を確認して「保存」してください");
    });
  }

  async function art(kind: "sheet" | "faces") {
    const saved = await save();
    if (!saved) return;
    await run(kind, async () => {
      setStatus(`${kind === "sheet" ? "設定画" : "表情集"}を作成中…（1〜2分）`);
      const r = await api("/api/admin/studio/characters", { action: "art", id: saved.id, kind, note: notes[kind] });
      (kind === "sheet" ? setSheet : setFaces)(r.url);
      setStatus(`できました（${r.seconds}秒）`);
    });
  }

  async function remove() {
    if (!confirm(`「${c.name}」を削除しますか？（絵は残ります）`)) return;
    await run("delete", async () => {
      await api("/api/admin/studio/characters", { action: "delete", id: c.id });
      router.push("/admin/studio");
    });
  }

  if (!loaded) return <main style={{ padding: 24 }}>読み込み中…</main>;
  const ja = CHARACTER_FIELDS.filter((f) => !f.en);
  const en = CHARACTER_FIELDS.filter((f) => f.en);

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <a href="/admin/studio">← スタジオへ</a>
      <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>{isNew ? "キャラを登録" : c.name}</h1>
      <Notice status={status} error={error} />

      <section className="card" style={{ gap: 12 }}>
        <strong style={{ fontSize: 18 }}>1. 設定（日本語）</strong>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>動画に効く要素（顔の構造・動き方・鳴き声）はできるだけ詳しく。ここから英語の指示をAIが書き、絵と動画の両方に使います。</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
          {ja.map((f) => (
            <div key={f.key} style={{ gridColumn: f.rows && f.rows > 1 ? "1 / -1" : undefined }}>
              <Field label={f.label} hint={f.hint} value={c[f.key]} onChange={(v) => set(f.key, v)} rows={f.rows} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="cta yellow" onClick={english} disabled={busy !== null || !c.name} style={{ padding: "10px 18px" }}>
            {busy === "english" ? "書いています…" : "AIに英語の指示を書かせる"}
          </button>
          <button type="button" className="cta" onClick={save} disabled={busy !== null || !c.name} style={{ padding: "10px 18px" }}>
            {busy === "save" ? "保存中…" : "保存"}
          </button>
        </div>
      </section>

      <section className="card" style={{ gap: 12 }}>
        <strong style={{ fontSize: 18 }}>2. 絵と動画に渡す指示（英語）</strong>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>AIが書いたものを必要なら直してください。見た目の指示には「口と目がどこにあるか」「描いてはいけない物」が入っているか確認を。</p>
        {en.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint} value={c[f.key]} onChange={(v) => set(f.key, v)} rows={f.rows} mono />
        ))}
      </section>

      <section className="card" style={{ gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <strong style={{ fontSize: 18 }}>3. 絵（設定画 約25円・表情集 約10円）</strong>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={silhouette} onChange={(e) => setSilhouette(e.target.checked)} />
            シルエットで見る（既存キャラに似ていないかの確認）
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#666" }}>設定画（正面・横・後ろ）</span>
            <Art src={sheet} alt="設定画" silhouette={silhouette} />
            <textarea value={notes.sheet} maxLength={STUDIO_NOTE_MAX} rows={2} onChange={(e) => setNotes((n) => ({ ...n, sheet: e.target.value }))} placeholder="追加の指示（任意・日本語でOK）例：もっと歯を大きく" />
            <button type="button" className="cta" onClick={() => art("sheet")} disabled={busy !== null || !c.name}>{busy === "sheet" ? "作成中…" : sheet ? "設定画を作り直す" : "設定画を作る"}</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#666" }}>表情集（よろこぶ・おこる・こわがる・ねむい）</span>
            <Art src={faces} alt="表情集" ratio="1 / 1" silhouette={silhouette} />
            <textarea value={notes.faces} maxLength={STUDIO_NOTE_MAX} rows={2} onChange={(e) => setNotes((n) => ({ ...n, faces: e.target.value }))} placeholder="追加の指示（任意）" />
            <button type="button" className="cta" onClick={() => art("faces")} disabled={busy !== null || !c.name}>{busy === "faces" ? "作成中…" : faces ? "表情集を作り直す" : "表情集を作る"}</button>
          </div>
        </div>
      </section>

      {!isNew && (
        <section className="card" style={{ gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
            <strong style={{ fontSize: 18 }}>4. {c.name}のショート動画（アーカイブ）</strong>
            <Link className="cta" href={`/admin/studio/shorts/new?character=${c.id}`} style={{ padding: "8px 16px" }}>＋ {c.name}で新しいショートを作る</Link>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#666" }}>このキャラで作ったショートが全部ここに並びます。1本ごとに台本・絵・今の動画と、「アーカイブに保存」した動画が残ります。</p>
          <ShortList characterId={c.id} />
        </section>
      )}

      {!isNew && (
        <div>
          <button type="button" onClick={remove} disabled={busy !== null} style={{ background: "none", border: "1px solid #ccc", borderRadius: 8, padding: "6px 12px", color: "#888", cursor: "pointer" }}>このキャラを削除</button>
        </div>
      )}
    </main>
  );
}
