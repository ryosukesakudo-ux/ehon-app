"use client";

import { useState } from "react";
import { STORIES, TASTES, type StoryId, type TasteId } from "@/lib/catalog";
import { shrinkPhoto } from "@/lib/shrink-photo";

type Who = "child" | "mom" | "dad";
const WHO: { id: Who; label: string }[] = [
  { id: "child", label: "子ども（必須）" },
  { id: "mom", label: "ママ（任意）" },
  { id: "dad", label: "パパ（任意）" },
];

// 1ドル150円で計算した、1枚あたりの目安
const MODES = [
  { id: "compare-high", title: "以前の方式：最高画質 2048px", cost: "1枚 約63円" },
  { id: "compare-a", title: "A方式（今の本番）：最高画質 1024px → 2048pxに拡大", cost: "1枚 約25円" },
] as const;

type Result = { status: "working" | "done" | "error"; image?: string; seconds?: number; error?: string };

// 同じ写真・同じ場面で、以前の方式（2048px）と今の本番（A方式）を1枚ずつ作って見比べる（保存はしない）
export default function ComparePage() {
  const [photos, setPhotos] = useState<Partial<Record<Who, File>>>({});
  const [taste, setTaste] = useState<TasteId>("watercolor");
  const [story, setStory] = useState<StoryId>("forest");
  const [scene, setScene] = useState(0);
  const [results, setResults] = useState<Partial<Record<(typeof MODES)[number]["id"], Result>>>({});
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = preparing || Object.values(results).some((r) => r?.status === "working");
  const scenes = STORIES.find((s) => s.id === story)!.scenes;

  async function start() {
    // 押したことがすぐ分かるよう、写真の準備中から「作成中」にする
    setPreparing(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : "写真を読み込めませんでした。別の写真をお試しください");
    } finally {
      setPreparing(false);
    }
  }

  async function run() {
    const form = new FormData();
    form.set("taste", taste);
    form.set("story", story);
    form.set("scene", String(scene));
    for (const w of WHO) {
      const f = photos[w.id];
      if (f) form.set(`${w.id}Photo`, await shrinkPhoto(f, 1024));
    }
    setResults({ "compare-high": { status: "working" }, "compare-a": { status: "working" } });
    await Promise.all(
      MODES.map(async (m) => {
        const body = new FormData();
        for (const [k, v] of form) body.set(k, v);
        body.set("quality", m.id);
        try {
          const res = await fetch("/api/admin/trial", { method: "POST", body });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error ?? `失敗しました (${res.status})`);
          setResults((r) => ({ ...r, [m.id]: { status: "done", image: json.image, seconds: json.seconds } }));
        } catch (e) {
          setResults((r) => ({ ...r, [m.id]: { status: "error", error: e instanceof Error ? e.message : "失敗しました" } }));
        }
      }),
    );
  }

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <a href="/admin">← 注文管理へ</a>
      <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>画質くらべ</h1>
      <p className="step-lead">
        同じ写真・同じ場面で、以前の方式（2048px）と今の本番（A方式）を1枚ずつ作って並べます（2枚で約90円）。写真と絵はサーバーに保存しません。
        AIは毎回少し違う絵を描くので、構図ではなく「線や色のくっきりさ」を比べてください。
      </p>

      <section className="card" style={{ gap: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {WHO.map((w) => (
            <div key={w.id} className="field" style={{ minWidth: 200 }}>
              <label htmlFor={`p-${w.id}`}>{w.label}</label>
              <input id={`p-${w.id}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhotos({ ...photos, [w.id]: e.target.files?.[0] })} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <div className="field">
            <label htmlFor="taste">テイスト</label>
            <select id="taste" value={taste} onChange={(e) => setTaste(e.target.value as TasteId)}>
              {TASTES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="story">お話</label>
            <select id="story" value={story} onChange={(e) => { setStory(e.target.value as StoryId); setScene(0); }}>
              {STORIES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="scene">場面</label>
            <select id="scene" value={scene} onChange={(e) => setScene(Number(e.target.value))}>
              {scenes.map((sc, i) => <option key={i} value={i}>{i + 1}. {sc.text.replaceAll("{name}", "○○").slice(0, 18)}…</option>)}
            </select>
          </div>
        </div>
        <button type="button" className="cta" disabled={!photos.child || running} onClick={start} style={{ maxWidth: 360 }}>
          {running ? "作成中…（1〜2分）" : "2枚つくって比べる"}
        </button>
        {!photos.child && <p className="step-lead">子どもの写真を選ぶと押せるようになります。</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        {MODES.map((m) => {
          const r = results[m.id];
          return (
            <section key={m.id} className="card" style={{ gap: 10 }}>
              <h2 className="display" style={{ margin: 0, fontSize: 17, color: "var(--navy)" }}>{m.title}</h2>
              <div style={{ fontSize: 13, color: "var(--sub)" }}>{m.cost}{r?.seconds ? `／作成 ${r.seconds}秒` : ""}</div>
              <div style={{ aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", background: "#E6EEF9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--sub)" }}>
                {r?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 生成した絵（data URL）
                  <img src={r.image} alt={m.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : r?.status === "working" ? (
                  <div className="spinner" />
                ) : r?.status === "error" ? (
                  <span style={{ color: "#8f2214", padding: 12 }}>{r.error}</span>
                ) : (
                  "まだありません"
                )}
              </div>
              {r?.image && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>中央を等倍で表示（印刷したときの細かさ）</div>
                  <div style={{ height: 320, borderRadius: 12, border: "1px solid var(--line)", backgroundImage: `url(${r.image})`, backgroundSize: "2048px 2048px", backgroundPosition: "center 40%", backgroundRepeat: "no-repeat" }} />
                  <a href={r.image} download={`${m.id}.jpg`} style={{ fontSize: 14 }}>この絵を保存する</a>
                </>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
