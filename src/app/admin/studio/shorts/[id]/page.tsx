"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { samplePublicUrl } from "@/lib/samples";
import { KEYS_MAX, KEYS_MIN, PREMISE_MAX, QA_ANSWER_MAX, SEGMENT_SECONDS, STUDIO_NOTE_MAX, emptyKey, emptySegment, emptyShort, studioFullPath, studioKeyPath, studioSegmentPath, toSeconds, totalSeconds, veoCost, type StudioCharacter, type StudioShort, type StudioTake, type VeoQuality } from "@/lib/studio";
import { Art, Field, Notice, Steps, VideoBox, api, apiGet, errorText, exists, readStore, withVersion, writeStore } from "../../_ui";

// ショートのページ（止め絵方式、2026-10-20）：ねらい → AIのヒアリング → 台本（止め絵2〜6枚＋間の区間）→ 止め絵を描く → 区間ごとに Veo で動かす → つないで完成
export default function ShortPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = params.id === "new";
  // キャラのページから「このキャラで新しいショートを作る」で来たときは、そのキャラを選んだ状態で始める（?character=…）
  const [s, setS] = useState<StudioShort>(() => ({ ...emptyShort(), characterId: (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("character")) || null }));
  const [takes, setTakes] = useState<StudioTake[]>([]);
  /** 直近に作った動画の画質（アーカイブに保存するときのラベル用） */
  const [lastQuality, setLastQuality] = useState<VeoQuality | undefined>();
  const [characters, setCharacters] = useState<StudioCharacter[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  /** Veo で作成中の区間（複数同時に作れる） */
  const [videoBusy, setVideoBusy] = useState<Record<number, boolean>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enough, setEnough] = useState<boolean | null>(null);
  const [keyNotes, setKeyNotes] = useState<Record<number, string>>({});
  const [segNotes, setSegNotes] = useState<Record<number, string>>({});
  /** 絵 n・区間 n の動画が保存されているか（URL は版付き） */
  const [keyUrls, setKeyUrls] = useState<Record<number, string | null>>({});
  const [segUrls, setSegUrls] = useState<Record<number, string | null>>({});
  const [full, setFull] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);


  /** 絵・区間・完成の動画が保存されているか確かめて、あるものだけ URL を持つ */
  async function loadMedia(short: StudioShort) {
    const keys = await Promise.all(short.keys.map(async (_, i) => {
      const u = withVersion(samplePublicUrl(studioKeyPath(short.id, i + 1)));
      return [i + 1, (await exists(u)) ? u : null] as const;
    }));
    const segs = await Promise.all(short.segments.map(async (_, i) => {
      const u = withVersion(samplePublicUrl(studioSegmentPath(short.id, i + 1)));
      return [i + 1, (await exists(u)) ? u : null] as const;
    }));
    const f = withVersion(samplePublicUrl(studioFullPath(short.id)));
    setKeyUrls(Object.fromEntries(keys));
    setSegUrls(Object.fromEntries(segs));
    setFull((await exists(f)) ? f : null);
  }

  const storeKey = (id: string, n: number) => `ehon-studio-op:${id}:seg${n}`;

  async function reloadTakes(id: string) {
    try {
      const r = await apiGet(`/api/admin/studio/shorts?id=${id}`);
      setTakes(r.takes ?? []);
    } catch {}
  }

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

  /** 新規のときは保存後に URL を切り替える */
  function afterSave(saved: StudioShort) {
    setS(saved);
    if (isNew) router.replace(`/admin/studio/shorts/${saved.id}`);
  }

  async function save(quiet = false): Promise<StudioShort | null> {
    return run("save", async () => {
      const r = await api("/api/admin/studio/shorts", { action: "save", short: s });
      afterSave(r.short);
      if (!quiet) setStatus("保存しました");
      return r.short as StudioShort;
    });
  }

  async function questions() {
    await run("questions", async () => {
      setStatus("AIが足りない情報を考えています…（20秒ほど）");
      const r = await api("/api/admin/studio/shorts", { action: "questions", short: s });
      afterSave(r.short);
      setEnough(r.enough);
      setStatus(r.enough ? "情報は十分です。「台本を書く」に進めます" : `質問が${r.questions.length}つあります。答えてからもう一度「質問をもらう」か、そのまま「台本を書く」へ`);
    });
  }

  async function script() {
    await run("script", async () => {
      setStatus("AIが台本を書いています…（30秒ほど）");
      const r = await api("/api/admin/studio/shorts", { action: "script", short: s });
      afterSave(r.short);
      setStatus(`台本を書きました（止め絵${r.short.keys.length}枚・${totalSeconds(r.short)}秒）。内容を確認・修正して、絵に進んでください（修正したら「保存」）`);
    });
  }

  async function frame(n: number) {
    await run(`frame:${n}`, async () => {
      setStatus(`絵${n}を作成中…（1〜2分）`);
      const r = await api("/api/admin/studio/shorts", { action: "frame", short: s, n, note: keyNotes[n] ?? "" });
      setKeyUrls((u) => ({ ...u, [n]: r.url }));
      setStatus(`絵${n}ができました（${r.seconds}秒）`);
    });
  }

  async function video(n: number, quality: VeoQuality) {
    setVideoBusy((b) => ({ ...b, [n]: true }));
    setError(null);
    const seconds = s.segments[n - 1]?.seconds ?? 6;
    setStatus(`区間${n}（絵${n}→絵${n + 1}・${seconds}秒）を Veo（${quality === "fast" ? "Fast" : "Standard"}）で作成中…（1〜6分）`);
    try {
      const r = await api("/api/admin/studio/shorts", { action: "video", short: s, seg: n, quality, note: segNotes[n] ?? "" });
      const started = Date.now();
      writeStore(storeKey(s.id, n), { operation: r.operation, started, quality });
      setLastQuality(quality);
      setStatus((t) => `${t}（${r.usedReferenceImages ? "設定画と表情集を参考画像に" : seconds === 8 ? "参考画像は Veo に断られたので無し" : "参考画像は8秒のときだけ使えます"}）`);
      watch(s.id, n, r.operation, started);
    } catch (e) {
      setError(errorText(e));
      setStatus(null);
      setVideoBusy((b) => ({ ...b, [n]: false }));
    }
  }

  function watch(id: string, n: number, operation: string, started: number) {
    const poll = async () => {
      try {
        const q = new URLSearchParams({ operation, id, seg: String(n) });
        const json = await apiGet(`/api/admin/studio/shorts?${q}`);
        if (json.done) {
          writeStore(storeKey(id, n), null);
          setSegUrls((u) => ({ ...u, [n]: json.url }));
          setStatus(`区間${n}ができました（${Math.round((Date.now() - started) / 1000)}秒）。全部の区間ができたら「つないで完成にする」`);
          setVideoBusy((b) => ({ ...b, [n]: false }));
          return;
        }
        setStatus(`区間${n}を Veo で作成中…（${Math.round((Date.now() - started) / 1000)}秒経過。この画面を閉じたりリロードしても続きます）`);
        timers.current.push(setTimeout(poll, 10000));
      } catch (e) {
        writeStore(storeKey(id, n), null);
        setError(errorText(e));
        setStatus(null);
        setVideoBusy((b) => ({ ...b, [n]: false }));
      }
    };
    timers.current.push(setTimeout(poll, 10000));
  }

  useEffect(() => {
    (async () => {
      try {
        const c = await apiGet("/api/admin/studio/characters");
        setCharacters(c.characters);
        if (!isNew) {
          const r = await apiGet(`/api/admin/studio/shorts?id=${params.id}`);
          setS(r.short);
          setTakes(r.takes ?? []);
          await loadMedia(r.short);
          // リロード前に動画を作っていたら続きを確認する
          for (let n = 1; n <= r.short.segments.length; n++) {
            const saved = readStore(storeKey(r.short.id, n));
            if (saved) {
              setVideoBusy((b) => ({ ...b, [n]: true }));
              setStatus(`区間${n}を Veo で作成中…（リロード前の続きを確認しています）`);
              watch(r.short.id, n, saved.operation, saved.started);
            }
          }
        }
      } catch (e) {
        setError(errorText(e));
      } finally {
        setLoaded(true);
      }
    })();
    const pending = timers.current;
    return () => { pending.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 開いたときに1回だけ
  }, []);

  async function join() {
    await run("join", async () => {
      setStatus("区間の動画をつないでいます…（数十秒）");
      const r = await api("/api/admin/studio/shorts", { action: "join", id: s.id });
      setFull(r.url);
      setStatus(`完成の動画ができました（${totalSeconds(s)}秒）。残したいときは動画の下の「アーカイブに保存」を押してください（つなぎ直すと上書きされます）`);
    });
  }

  async function duplicate() {
    await run("duplicate", async () => {
      const r = await api("/api/admin/studio/shorts", { action: "duplicate", id: s.id });
      router.push(`/admin/studio/shorts/${r.short.id}`);
    });
  }

  async function keep() {
    await run("keep", async () => {
      await api("/api/admin/studio/shorts", { action: "keep", id: s.id, quality: lastQuality });
      setStatus("完成の動画をアーカイブに保存しました");
      await reloadTakes(s.id);
    });
  }

  async function adopt(t: StudioTake) {
    if (!confirm(`この動画（${takeLabel(t)}）を今の完成にしますか？`)) return;
    await run(`take:${t.name}`, async () => {
      const r = await api("/api/admin/studio/shorts", { action: "adopt", id: s.id, name: t.name });
      setFull(r.url);
      setStatus(`${takeLabel(t)}を今の完成にしました`);
    });
  }

  async function deleteTake(t: StudioTake) {
    if (!confirm(`アーカイブから「${takeLabel(t)}」を消しますか？（元に戻せません）`)) return;
    await run(`take:${t.name}`, async () => {
      await api("/api/admin/studio/shorts", { action: "deleteTake", id: s.id, name: t.name });
      setTakes((xs) => xs.filter((x) => x.name !== t.name));
    });
  }

  async function remove() {
    if (!confirm(`「${s.title || "このショート"}」を削除しますか？（絵と動画は残ります）`)) return;
    await run("delete", async () => {
      await api("/api/admin/studio/shorts", { action: "delete", id: s.id });
      router.push("/admin/studio");
    });
  }

  // 台本の編集
  const setKey = (i: number, key: "scene" | "frame", v: string) => setS((x) => ({ ...x, keys: x.keys.map((k, n) => (n === i ? { ...k, [key]: v } : k)) }));
  const setSeg = (i: number, key: "motion" | "sound" | "seconds", v: string) => setS((x) => ({ ...x, segments: x.segments.map((g, n) => (n === i ? { ...g, [key]: key === "seconds" ? toSeconds(v) : v } : g)) }));
  const addKey = () => setS((x) => (x.keys.length >= KEYS_MAX ? x : { ...x, keys: [...x.keys, emptyKey()], segments: [...x.segments, emptySegment()] }));
  const removeLastKey = () => {
    if (s.keys.length <= KEYS_MIN) return;
    if (!confirm(`最後の絵${s.keys.length}と区間${s.segments.length}を台本から消しますか？（作った絵と動画のファイルは残ります）`)) return;
    setS((x) => ({ ...x, keys: x.keys.slice(0, -1), segments: x.segments.slice(0, -1) }));
  };

  if (!loaded) return <main style={{ padding: 24 }}>読み込み中…</main>;
  const c = characters.find((x) => x.id === s.characterId) ?? null;
  const hasScript = s.segments.length > 0 && s.segments.every((x) => x.motion) && s.keys.every((k) => k.frame);
  const unanswered = s.qa.filter((x) => !x.a.trim()).length;
  const disabled = busy !== null;
  const keysDone = s.keys.filter((_, i) => keyUrls[i + 1]).length;
  const segsDone = s.segments.filter((_, i) => segUrls[i + 1]).length;
  const anyVideoBusy = Object.values(videoBusy).some(Boolean);
  const seconds = totalSeconds(s);

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <a href="/admin/studio">← スタジオへ</a>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline" }}>
        <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>{isNew ? "ショートを作る" : `「${s.title || "題名なし"}」`}</h1>
        {c && <span className="tag">{c.name}</span>}
        <span className="tag">止め絵{s.keys.length}枚・{seconds}秒・セリフなし</span>
      </div>
      <Steps items={[
        { label: "ねらい", done: Boolean(s.premise) },
        { label: "ヒアリング", done: enough === true || (s.qa.length > 0 && unanswered === 0) },
        { label: "台本", done: hasScript },
        { label: `絵 ${keysDone}/${s.keys.length}`, done: keysDone === s.keys.length },
        { label: `動画 ${segsDone}/${s.segments.length}`, done: segsDone === s.segments.length },
        { label: `完成${seconds}秒`, done: Boolean(full) },
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
          <strong style={{ fontSize: 18 }}>3. 台本（止め絵{s.keys.length}枚 ＋ 間の動き{s.segments.length}区間 ＝ {seconds}秒）</strong>
          <button type="button" className="cta yellow" onClick={script} disabled={disabled || !s.characterId} style={{ padding: "10px 18px" }}>{busy === "script" ? "書いています…" : hasScript ? "AIに台本を書き直させる" : "AIに台本を書かせる"}</button>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>お話を「止め絵」に分け、絵と絵の間だけを Veo に動かしてもらいます。Veo は最初と最後の絵にいちばん従うので、見せたい瞬間（例：小石を歯でがっちり挟んで力んでいる姿）は全部、止め絵の1枚にします。1区間の動きは1〜2個まで。</p>
        {s.keys.map((k, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 12, background: "#f7f5ef" }}>
              <strong>絵{i + 1}{i === 0 ? "（始まり）" : i === s.keys.length - 1 ? "（終わり）" : ""}</strong>
              <Field label="この瞬間に見えているもの（日本語）" value={k.scene} onChange={(v) => setKey(i, "scene", v)} rows={2} />
              <Field label="絵の指示（英語）" value={k.frame} onChange={(v) => setKey(i, "frame", v)} rows={3} mono />
            </div>
            {i < s.segments.length && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 12px 8px", borderLeft: "3px solid #dcd6c6", marginLeft: 12 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <strong>区間{i + 1}（絵{i + 1} → 絵{i + 2}）</strong>
                  <label style={{ fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}>
                    長さ
                    <select value={s.segments[i].seconds} onChange={(e) => setSeg(i, "seconds", e.target.value)}>
                      {SEGMENT_SECONDS.map((v) => <option key={v} value={v}>{v}秒</option>)}
                    </select>
                  </label>
                </div>
                <Field label="音・鳴き声（日本語）" value={s.segments[i].sound} onChange={(v) => setSeg(i, "sound", v)} />
                <Field label="動きと音（英語）" value={s.segments[i].motion} onChange={(v) => setSeg(i, "motion", v)} rows={4} mono />
              </div>
            )}
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="cta" onClick={() => save()} disabled={disabled} style={{ padding: "10px 18px" }}>{busy === "save" ? "保存中…" : "台本を保存"}</button>
          <button type="button" onClick={addKey} disabled={disabled || s.keys.length >= KEYS_MAX} style={plainButton}>＋ 絵を1枚足す（最大{KEYS_MAX}枚）</button>
          <button type="button" onClick={removeLastKey} disabled={disabled || s.keys.length <= KEYS_MIN} style={plainButton}>− 最後の絵を消す</button>
        </div>
      </section>

      {/* 4. 止め絵 */}
      <section className="card" style={{ gap: 12 }}>
        <strong style={{ fontSize: 18 }}>4. 止め絵（1枚 約25円）</strong>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>左から順に。2枚目以降は1つ前の絵を参照して同じ場面・同じタッチで描きます。気に入らなければ追加の指示を書いて作り直してください（絵を作り直したら、その絵を使う区間の動画も作り直し）。</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
          {s.keys.map((k, i) => {
            const n = i + 1;
            const blocked = n > 1 && !keyUrls[n - 1];
            return (
              <div key={n} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 13, color: "#666" }}>絵{n}{k.scene ? `：${k.scene.slice(0, 24)}${k.scene.length > 24 ? "…" : ""}` : ""}</span>
                <Art src={keyUrls[n] ?? null} alt={`絵${n}`} ratio="2 / 3" />
                <textarea value={keyNotes[n] ?? ""} maxLength={STUDIO_NOTE_MAX} rows={2} onChange={(e) => setKeyNotes((x) => ({ ...x, [n]: e.target.value }))} placeholder="追加の指示（任意・日本語でOK）" />
                <button type="button" className="cta" onClick={() => frame(n)} disabled={disabled || !k.frame || blocked}>{busy === `frame:${n}` ? "作成中…" : keyUrls[n] ? `絵${n}を作り直す` : `絵${n}を作る`}</button>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. 動画 */}
      <section className="card" style={{ gap: 12 }}>
        <strong style={{ fontSize: 18 }}>5. 区間の動画（Veo 3.1）</strong>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>区間ごとに、前後の絵を Veo に渡して間を動かします。複数の区間を同時に作れます。試作は Fast、公開用は Standard がおすすめ。作成中は画面を閉じても続きます。</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
          {s.segments.map((g, i) => {
            const n = i + 1;
            const ready = Boolean(keyUrls[n] && keyUrls[n + 1]);
            const making = Boolean(videoBusy[n]);
            return (
              <div key={n} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 13, color: "#666" }}>区間{n}（絵{n}→絵{n + 1}・{g.seconds}秒）</span>
                <VideoBox src={segUrls[n] ?? null} />
                <textarea value={segNotes[n] ?? ""} maxLength={STUDIO_NOTE_MAX} rows={2} onChange={(e) => setSegNotes((x) => ({ ...x, [n]: e.target.value }))} placeholder="追加の指示（任意）" />
                <button type="button" className="cta yellow" onClick={() => video(n, "fast")} disabled={disabled || making || !ready || !g.motion}>{making ? "作成中…" : `Fast で作る（約${veoCost("fast", g.seconds)}円）`}</button>
                <button type="button" className="cta yellow" onClick={() => video(n, "standard")} disabled={disabled || making || !ready || !g.motion}>{making ? "作成中…" : `Standard で作る（約${veoCost("standard", g.seconds)}円）`}</button>
                {!ready && <span style={{ fontSize: 12, color: "#888" }}>先に絵{n}と絵{n + 1}を作ってください</span>}
              </div>
            );
          })}
        </div>
      </section>

      {/* 6. 完成 */}
      <section className="card" style={{ gap: 12 }}>
        <strong style={{ fontSize: 18 }}>6. つないで完成（{seconds}秒）</strong>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>全部の区間ができたら、順につないで1本にします（再エンコードなし、数十秒・無料）。つなぎ目は同じ絵なので形はずれません。</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, maxWidth: 320 }}>
          <VideoBox src={full} />
          <button type="button" className="cta yellow" onClick={join} disabled={disabled || anyVideoBusy || segsDone < s.segments.length || isNew} style={{ padding: "10px 18px" }}>{busy === "join" ? "つないでいます…" : full ? "もう一度つないで完成にする" : "つないで完成にする"}</button>
          {!isNew && <button type="button" className="cta" onClick={keep} disabled={disabled || !full} style={{ padding: "8px 12px", fontSize: 13 }}>{busy === "keep" ? "保存中…" : "この完成をアーカイブに保存"}</button>}
          {full && <a href={full} download={`${s.title || "short"}.mp4`} style={{ fontSize: 14 }}>完成した動画をダウンロード</a>}
        </div>
      </section>

      {/* 7. アーカイブ */}
      {!isNew && (
        <section className="card" style={{ gap: 12 }}>
          <strong style={{ fontSize: 18 }}>7. アーカイブ（保存した動画 {takes.length}本）</strong>
          <p style={{ margin: 0, fontSize: 13, color: "#666" }}>「アーカイブに保存」を押した動画だけがここに残ります（押さずに作り直すと上書きされて消えます）。気に入ったものは「これを採用」で上の「完成」に戻せます。別のお話を作るときは「複製して別のショートに」か、スタジオの「＋ ショートを作る」から。</p>
          {takes.length === 0 && <p style={{ margin: 0, fontSize: 14, color: "#888" }}>まだありません。残したい動画の下の「アーカイブに保存」を押してください。</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {takes.map((t) => (
              <div key={t.name} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8, border: "1px solid #eee", borderRadius: 12 }}>
                <VideoBox src={t.url} />
                <span style={{ fontSize: 12, color: "#555" }}>{takeLabel(t)}</span>
                {t.kind === "full" && <button type="button" className="cta" onClick={() => adopt(t)} disabled={disabled} style={{ padding: "6px 10px", fontSize: 13 }}>{busy === `take:${t.name}` ? "処理中…" : "これを採用"}</button>}
                <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
                  <a href={t.url} download={`${s.title || "short"}-${t.name}`}>ダウンロード</a>
                  <button type="button" onClick={() => deleteTake(t)} disabled={disabled} style={{ background: "none", border: 0, padding: 0, color: "#999", cursor: "pointer", fontSize: 12 }}>消す</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!isNew && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={duplicate} disabled={disabled} style={plainButton}>{busy === "duplicate" ? "複製中…" : "複製して別のショートに（同じキャラ・台本で）"}</button>
          <button type="button" onClick={remove} disabled={disabled} style={{ ...plainButton, color: "#888" }}>このショートを削除</button>
        </div>
      )}
    </main>
  );
}

const plainButton = { background: "none", border: "1px solid #ccc", borderRadius: 8, padding: "6px 12px", color: "#555", cursor: "pointer" } as const;

function takeLabel(t: StudioTake) {
  const d = new Date(t.at);
  const when = Number.isNaN(d.getTime()) ? t.at : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${when}　${t.kind === "a" ? "以前のA 8秒" : "完成"}${t.quality ? `・${t.quality === "fast" ? "Fast" : "Standard"}` : ""}`;
}
