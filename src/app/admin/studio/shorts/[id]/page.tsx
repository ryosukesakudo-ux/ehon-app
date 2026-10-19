"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { samplePublicUrl } from "@/lib/samples";
import { CLIP_FIELDS, PREMISE_MAX, QA_ANSWER_MAX, STUDIO_NOTE_MAX, VEO_COST, emptyShort, studioFramePath, studioVideoPath, type StudioCharacter, type StudioShort, type VeoQuality } from "@/lib/studio";
import { Art, Field, Notice, Steps, VideoBox, api, apiGet, errorText, readStore, withVersion, writeStore } from "../../_ui";

// ショートのページ：ねらい → AIのヒアリング → 台本 → 絵（Aの最初・最後）→ 動画（A 8秒 → 続きを延長して約15秒）（2026-10-19）
export default function ShortPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = params.id === "new";
  const [s, setS] = useState<StudioShort>(emptyShort);
  const [characters, setCharacters] = useState<StudioCharacter[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enough, setEnough] = useState<boolean | null>(null);
  const [notes, setNotes] = useState({ first: "", last: "", a: "", b: "" });
  const [first, setFirst] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [videoA, setVideoA] = useState<string | null>(null);
  const [videoFull, setVideoFull] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const c = await apiGet("/api/admin/studio/characters");
        setCharacters(c.characters);
        if (!isNew) {
          const r = await apiGet(`/api/admin/studio/shorts?id=${params.id}`);
          applyMedia(r.short.id);
          setS(r.short);
          // リロード前に動画を作っていたら続きを確認する
          for (const clip of ["a", "b"] as const) {
            const saved = readStore(storeKey(r.short.id, clip));
            if (saved) {
              timer.current = setTimeout(() => {
                setBusy(`video:${clip}`);
                setStatus("Veo で作成中…（リロード前の続きを確認しています）");
                watch(r.short.id, clip, saved.operation, saved.started);
              }, 0);
              break;
            }
          }
        }
      } catch (e) {
        setError(errorText(e));
      } finally {
        setLoaded(true);
      }
    })();
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 開いたときに1回だけ
  }, []);

  function applyMedia(id: string) {
    setFirst(withVersion(samplePublicUrl(studioFramePath(id, "first"))));
    setLast(withVersion(samplePublicUrl(studioFramePath(id, "last"))));
    setVideoA(withVersion(samplePublicUrl(studioVideoPath(id, "a"))));
    setVideoFull(withVersion(samplePublicUrl(studioVideoPath(id, "full"))));
  }

  const storeKey = (id: string, clip: "a" | "b") => `ehon-studio-op:${id}:${clip}`;

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
      setBusy((b) => (b === label ? null : b));
    }
  }

  /** 保存して、保存後の内容を返す（新規なら URL も切り替える） */
  async function save(quiet = false): Promise<StudioShort | null> {
    return run("save", async () => {
      const r = await api("/api/admin/studio/shorts", { action: "save", short: s });
      const saved = r.short as StudioShort;
      setS(saved);
      if (!quiet) setStatus("保存しました");
      if (isNew) {
        applyMedia(saved.id);
        router.replace(`/admin/studio/shorts/${saved.id}`);
      }
      return saved;
    });
  }

  async function questions() {
    await run("questions", async () => {
      setStatus("AIが足りない情報を考えています…（20秒ほど）");
      const r = await api("/api/admin/studio/shorts", { action: "questions", short: s });
      setS(r.short);
      setEnough(r.enough);
      if (isNew) { applyMedia(r.short.id); router.replace(`/admin/studio/shorts/${r.short.id}`); }
      setStatus(r.enough ? "情報は十分です。「台本を書く」に進めます" : `質問が${r.questions.length}つあります。答えてからもう一度「質問をもらう」か、そのまま「台本を書く」へ`);
    });
  }

  async function script() {
    await run("script", async () => {
      setStatus("AIが台本を書いています…（30秒ほど）");
      const r = await api("/api/admin/studio/shorts", { action: "script", short: s });
      setS(r.short);
      if (isNew) { applyMedia(r.short.id); router.replace(`/admin/studio/shorts/${r.short.id}`); }
      setStatus("台本を書きました。内容を確認・修正して、絵に進んでください（修正したら「保存」）");
    });
  }

  async function frame(which: "first" | "last") {
    await run(`frame:${which}`, async () => {
      setStatus(`${which === "first" ? "最初" : "最後"}のコマの絵を作成中…（1〜2分）`);
      const r = await api("/api/admin/studio/shorts", { action: "frame", short: s, which, note: notes[which] });
      (which === "first" ? setFirst : setLast)(r.url);
      setStatus(`絵ができました（${r.seconds}秒）`);
    });
  }

  async function video(clip: "a" | "b", quality: VeoQuality) {
    const label = `video:${clip}`;
    setBusy(label);
    setError(null);
    setStatus(`Veo（${quality === "fast" ? "Fast" : "Standard"}）で${clip === "a" ? "クリップA（8秒）" : "続き（7秒延長）"}を作成中…（1〜6分）`);
    try {
      const r = await api("/api/admin/studio/shorts", { action: "video", short: s, clip, quality, note: notes[clip] });
      const started = Date.now();
      writeStore(storeKey(s.id, clip), { operation: r.operation, started });
      if (clip === "a") setStatus((t) => `${t}（${r.usedLastFrame ? "最初と最後のコマを指定" : "最初のコマだけ"}・${r.usedReferenceImages ? "設定画と表情集を参考画像に" : "参考画像は Veo に断られたので無し"}）`);
      watch(s.id, clip, r.operation, started);
    } catch (e) {
      setError(errorText(e));
      setStatus(null);
      setBusy(null);
    }
  }

  function watch(id: string, clip: "a" | "b", operation: string, started: number) {
    const poll = async () => {
      try {
        const q = new URLSearchParams({ operation, id, clip });
        const json = await apiGet(`/api/admin/studio/shorts?${q}`);
        if (json.done) {
          writeStore(storeKey(id, clip), null);
          (clip === "a" ? setVideoA : setVideoFull)(json.url);
          setStatus(`${clip === "a" ? "クリップA" : "完成の15秒"}ができました（${Math.round((Date.now() - started) / 1000)}秒）`);
          setBusy(null);
          return;
        }
        setStatus(`Veo で作成中…（${Math.round((Date.now() - started) / 1000)}秒経過。この画面を閉じたりリロードしても続きます）`);
        timer.current = setTimeout(poll, 10000);
      } catch (e) {
        writeStore(storeKey(id, clip), null);
        setError(errorText(e));
        setStatus(null);
        setBusy(null);
      }
    };
    timer.current = setTimeout(poll, 10000);
  }

  async function remove() {
    if (!confirm(`「${s.title || "このショート"}」を削除しますか？（絵と動画は残ります）`)) return;
    await run("delete", async () => {
      await api("/api/admin/studio/shorts", { action: "delete", id: s.id });
      router.push("/admin/studio");
    });
  }

  if (!loaded) return <main style={{ padding: 24 }}>読み込み中…</main>;
  const c = characters.find((x) => x.id === s.characterId) ?? null;
  const a = s.clips[0];
  const b = s.clips[1];
  const setClip = (i: 0 | 1, key: keyof typeof a, v: string) => setS((x) => ({ ...x, clips: x.clips.map((cl, n) => (n === i ? { ...cl, [key]: v } : cl)) as StudioShort["clips"] }));
  const hasScript = Boolean(a.motion && b.motion);
  const unanswered = s.qa.filter((x) => !x.a.trim()).length;
  const disabled = busy !== null;

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <a href="/admin/studio">← スタジオへ</a>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline" }}>
        <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>{isNew ? "ショートを作る" : `「${s.title || "題名なし"}」`}</h1>
        {c && <span className="tag">{c.name}</span>}
        <span className="tag">約15秒・セリフなし</span>
      </div>
      <Steps items={[
        { label: "ねらい", done: Boolean(s.premise) },
        { label: "ヒアリング", done: enough === true || (s.qa.length > 0 && unanswered === 0) },
        { label: "台本", done: hasScript },
        { label: "絵", done: Boolean(first && last) },
        { label: "A 8秒", done: Boolean(videoA) },
        { label: "完成15秒", done: Boolean(videoFull) },
      ]} />
      <Notice status={status} error={error} />

      {/* 1. 基本 */}
      <section className="card" style={{ gap: 12 }}>
        <strong style={{ fontSize: 18 }}>1. キャラとねらい</strong>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span>キャラ（1本に1体）</span>
            <select value={s.characterId ?? ""} onChange={(e) => setS((x) => ({ ...x, characterId: e.target.value || null }))}>
              <option value="">選んでください</option>
              {characters.map((x) => <option key={x.id} value={x.id}>{x.name}（{x.base}）</option>)}
            </select>
          </label>
          <Field label="題名（空ならAIが付けます）" value={s.title} onChange={(v) => setS((x) => ({ ...x, title: v }))} maxLength={60} />
        </div>
        <Field label="どんなお話にしたいか（ざっくりでOK）" hint="例：夜中にガジリが小石をどんぐりと間違えてかじって痛がる。朝、子どもに拾われてただのどんぐりのふり" value={s.premise} onChange={(v) => setS((x) => ({ ...x, premise: v }))} rows={3} maxLength={PREMISE_MAX} />
        {c && (
          <details style={{ fontSize: 13, color: "#555" }}>
            <summary style={{ cursor: "pointer" }}>{c.name}の設定（台本とVeoに渡るもの）</summary>
            <p style={{ margin: "6px 0 0" }}>キモ要素：{c.gross}<br />顔の構造：{c.faceJa || "（未記入）"}<br />性格：{c.personality}<br />動き方：{c.movementJa || "（未記入）"}<br />鳴き声：{c.voiceJa}</p>
          </details>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="cta" onClick={() => save()} disabled={disabled} style={{ padding: "10px 18px" }}>{busy === "save" ? "保存中…" : "保存"}</button>
        </div>
      </section>

      {/* 2. ヒアリング */}
      <section className="card" style={{ gap: 12 }}>
        <strong style={{ fontSize: 18 }}>2. AIのヒアリング</strong>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>ねらいを読んで、AIが足りない情報を質問します。答えたらもう一度「質問をもらう」。「情報は十分です」と出たら台本へ。質問が無くても台本は書けます。</p>
        {s.qa.length > 0 && (
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            {s.qa.map((x, i) => (
              <li key={i} style={{ fontSize: 14 }}>
                <div>{x.q}</div>
                <input value={x.a} maxLength={QA_ANSWER_MAX} placeholder="答え（空ならおまかせ）" onChange={(e) => setS((st) => ({ ...st, qa: st.qa.map((y, n) => (n === i ? { ...y, a: e.target.value } : y)) }))} style={{ width: "100%", marginTop: 4 }} />
              </li>
            ))}
          </ol>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="cta yellow" onClick={questions} disabled={disabled || !s.characterId} style={{ padding: "10px 18px" }}>{busy === "questions" ? "考えています…" : s.qa.length ? "もう一度 質問をもらう" : "質問をもらう"}</button>
          {enough === true && <span style={{ fontSize: 14, color: "#1f6b2a" }}>✓ 情報は十分です</span>}
          {unanswered > 0 && <span style={{ fontSize: 13, color: "#888" }}>未回答 {unanswered} 問</span>}
        </div>
      </section>

      {/* 3. 台本 */}
      <section className="card" style={{ gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <strong style={{ fontSize: 18 }}>3. 台本（A 8秒 ＋ 続きのB 7秒）</strong>
          <button type="button" className="cta yellow" onClick={script} disabled={disabled || !s.characterId} style={{ padding: "10px 18px" }}>{busy === "script" ? "書いています…" : hasScript ? "AIに台本を書き直させる" : "AIに台本を書かせる"}</button>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>Bは「Aの動画の続きを延長」して作るので、Aの最後の状態からそのまま続きます。Aの最後は止まった状態で終わるのがコツ。</p>
        {([0, 1] as const).map((i) => {
          const clip = s.clips[i];
          return (
            <div key={clip.id} style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8, borderTop: "1px solid #eee" }}>
              <strong>クリップ {clip.id.toUpperCase()}（{i === 0 ? "0〜8秒・最初と最後の絵から" : "8〜15秒・Aの続きとして延長"}）</strong>
              {CLIP_FIELDS.filter((f) => !(f.onlyA && i === 1)).map((f) => (
                <Field key={f.key} label={f.label} value={clip[f.key]} onChange={(v) => setClip(i, f.key, v)} rows={f.rows} mono={f.en} />
              ))}
            </div>
          );
        })}
        <div><button type="button" className="cta" onClick={() => save()} disabled={disabled} style={{ padding: "10px 18px" }}>{busy === "save" ? "保存中…" : "台本を保存"}</button></div>
      </section>

      {/* 4. 絵 */}
      <section className="card" style={{ gap: 12 }}>
        <strong style={{ fontSize: 18 }}>4. クリップAの絵（1枚 約25円）</strong>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>最初のコマ → 最後のコマの順に。最後のコマは最初のコマを参照して同じ場面・同じタッチで描きます。キャラの設定画・表情集が先に必要です。</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 640 }}>
          {(["first", "last"] as const).map((w) => (
            <div key={w} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#666" }}>{w === "first" ? "最初のコマ" : "最後のコマ"}</span>
              <Art src={w === "first" ? first : last} alt={w} ratio="2 / 3" />
              <textarea value={notes[w]} maxLength={STUDIO_NOTE_MAX} rows={2} onChange={(e) => setNotes((n) => ({ ...n, [w]: e.target.value }))} placeholder="追加の指示（任意・日本語でOK）" />
              <button type="button" className="cta" onClick={() => frame(w)} disabled={disabled || !hasScript || (w === "last" && !first)}>{busy === `frame:${w}` ? "作成中…" : `${w === "first" ? "最初" : "最後"}のコマを作る`}</button>
            </div>
          ))}
        </div>
      </section>

      {/* 5. 動画 */}
      <section className="card" style={{ gap: 12 }}>
        <strong style={{ fontSize: 18 }}>5. 動画（Veo 3.1）</strong>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>まずクリップA（8秒）。よければ「続きを延長」でBを足し、1本の約15秒になります。試作は Fast、公開用は Standard がおすすめ。作成中は画面を閉じても続きます。</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 640 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#666" }}>クリップA（8秒）</span>
            <VideoBox src={videoA} />
            <textarea value={notes.a} maxLength={STUDIO_NOTE_MAX} rows={2} onChange={(e) => setNotes((n) => ({ ...n, a: e.target.value }))} placeholder="追加の指示（任意）" />
            <button type="button" className="cta yellow" onClick={() => video("a", "fast")} disabled={disabled || !first}>{busy === "video:a" ? "作成中…" : `A を Fast で作る（約${VEO_COST.fast.a}円）`}</button>
            <button type="button" className="cta yellow" onClick={() => video("a", "standard")} disabled={disabled || !first}>{busy === "video:a" ? "作成中…" : `A を Standard で作る（約${VEO_COST.standard.a}円）`}</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#666" }}>完成（A＋続き・約15秒）</span>
            <VideoBox src={videoFull} />
            <textarea value={notes.b} maxLength={STUDIO_NOTE_MAX} rows={2} onChange={(e) => setNotes((n) => ({ ...n, b: e.target.value }))} placeholder="追加の指示（任意）" />
            <button type="button" className="cta yellow" onClick={() => video("b", "fast")} disabled={disabled || !videoA}>{busy === "video:b" ? "作成中…" : `続きを Fast で延長（約${VEO_COST.fast.b}円）`}</button>
            <button type="button" className="cta yellow" onClick={() => video("b", "standard")} disabled={disabled || !videoA}>{busy === "video:b" ? "作成中…" : `続きを Standard で延長（約${VEO_COST.standard.b}円）`}</button>
            {videoFull && <a href={videoFull} download={`${s.title || "short"}.mp4`} style={{ fontSize: 14 }}>完成した動画をダウンロード</a>}
          </div>
        </div>
      </section>

      {!isNew && (
        <div>
          <button type="button" onClick={remove} disabled={disabled} style={{ background: "none", border: "1px solid #ccc", borderRadius: 8, padding: "6px 12px", color: "#888", cursor: "pointer" }}>このショートを削除</button>
        </div>
      )}
    </main>
  );
}
