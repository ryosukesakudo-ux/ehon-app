"use client";

import { useEffect, useMemo, useState } from "react";
import { STORIES, TASTES, sceneText, type StoryId, type TasteId } from "@/lib/catalog";
import { shrinkPhoto } from "@/lib/shrink-photo";

type Who = "child" | "mom" | "dad";
const WHO: { id: Who; label: string; required: boolean }[] = [
  { id: "child", label: "子ども（主人公）", required: true },
  { id: "mom", label: "ママ", required: false },
  { id: "dad", label: "パパ", required: false },
];

type Page = { status: "waiting" | "working" | "done" | "error"; image?: string; error?: string };
type Books = Partial<Record<StoryId, Page[]>>;

// 同時に作る枚数（多すぎると OpenAI の利用上限に当たる）
const PARALLEL = 3;

function Thumb({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  // eslint-disable-next-line @next/next/no-img-element -- 選んだ写真のその場プレビュー
  return <img src={url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10 }} />;
}

export default function TrialPage() {
  const [photos, setPhotos] = useState<Partial<Record<Who, File>>>({});
  const [name, setName] = useState("");
  const [taste, setTaste] = useState<TasteId>("watercolor");
  const [stories, setStories] = useState<StoryId[]>(STORIES.map((s) => s.id));
  const [books, setBooks] = useState<Books>({});
  const [running, setRunning] = useState(false);
  const [usedName, setUsedName] = useState("");

  const setPage = (story: StoryId, i: number, page: Page) =>
    setBooks((b) => ({ ...b, [story]: (b[story] ?? []).map((p, j) => (j === i ? page : p)) }));

  async function makePage(form: FormData, story: StoryId, i: number) {
    setPage(story, i, { status: "working" });
    const body = new FormData();
    for (const [k, v] of form) body.set(k, v);
    body.set("story", story);
    body.set("scene", String(i));
    try {
      const res = await fetch("/api/admin/trial", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `失敗しました (${res.status})`);
      setPage(story, i, { status: "done", image: json.image });
    } catch (e) {
      setPage(story, i, { status: "error", error: e instanceof Error ? e.message : "失敗しました" });
    }
  }

  async function baseForm() {
    const form = new FormData();
    form.set("taste", taste);
    form.set("quality", "preview");
    for (const w of WHO) {
      const f = photos[w.id];
      if (f) form.set(`${w.id}Photo`, await shrinkPhoto(f, 1024));
    }
    return form;
  }

  async function start() {
    setRunning(true);
    setUsedName(name.trim());
    const form = await baseForm();
    const initial: Books = {};
    const jobs: [StoryId, number][] = [];
    for (const id of stories) {
      const n = STORIES.find((s) => s.id === id)!.scenes.length;
      initial[id] = Array.from({ length: n }, () => ({ status: "waiting" }));
      for (let i = 0; i < n; i++) jobs.push([id, i]);
    }
    setBooks(initial);
    const queue = [...jobs];
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        for (let job = queue.shift(); job; job = queue.shift()) await makePage(form, job[0], job[1]);
      }),
    );
    setRunning(false);
  }

  async function retry(story: StoryId, i: number) {
    await makePage(await baseForm(), story, i);
  }

  const total = Object.values(books).reduce((n, b) => n + (b?.length ?? 0), 0);
  const done = Object.values(books).reduce((n, b) => n + (b?.filter((p) => p.status === "done").length ?? 0), 0);
  const canStart = !!photos.child && name.trim().length > 0 && stories.length > 0 && !running;

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>試作スタジオ</h1>
      <p className="step-lead">
        写真から、お話ごとの全場面の絵を作って並べます。写真と絵はサーバーに保存しません（このページを閉じると消えます）。
      </p>

      <section className="card" style={{ gap: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {WHO.map((w) => (
            <div key={w.id} className="field" style={{ minWidth: 200 }}>
              <label htmlFor={`p-${w.id}`}>
                {w.label}
                {w.required ? "（必須）" : "（任意）"}
              </label>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {photos[w.id] && <Thumb file={photos[w.id]!} />}
                <input
                  id={`p-${w.id}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setPhotos({ ...photos, [w.id]: e.target.files?.[0] })}
                />
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <div className="field">
            <label htmlFor="name">主人公の名前（ひらがな）</label>
            <input id="name" type="text" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="taste">テイスト</label>
            <select id="taste" value={taste} onChange={(e) => setTaste(e.target.value as TasteId)} style={{ height: 48, borderRadius: 14, padding: "0 10px", fontSize: 16 }}>
              {TASTES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: 16 }}>
          <legend className="display" style={{ fontSize: 14, fontWeight: 800, color: "var(--navy)", marginBottom: 6 }}>作るお話</legend>
          {STORIES.map((s) => (
            <label key={s.id} className="consent" style={{ fontSize: 14 }}>
              <input
                type="checkbox"
                checked={stories.includes(s.id)}
                onChange={(e) => setStories(e.target.checked ? [...stories, s.id] : stories.filter((x) => x !== s.id))}
              />
              {s.name}（{s.scenes.length}場面）
            </label>
          ))}
        </fieldset>
        <button type="button" className="cta" disabled={!canStart} onClick={start} style={{ maxWidth: 360 }}>
          {running ? `作成中… ${done}/${total}` : "絵本をつくる"}
        </button>
      </section>

      {STORIES.filter((s) => books[s.id]).map((s) => (
        <section key={s.id} className="card" style={{ gap: 14 }}>
          <h2 className="display" style={{ margin: 0, color: "var(--navy)" }}>{s.name}</h2>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
            {books[s.id]!.map((p, i) => (
              <li key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", background: "#E6EEF9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--sub)", textAlign: "center", padding: p.image ? 0 : 12 }}>
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 生成した絵（data URL）
                    <img src={p.image} alt={`場面${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : p.status === "working" ? (
                    <div className="spinner" />
                  ) : p.status === "error" ? (
                    <span style={{ color: "#8f2214" }}>{p.error}</span>
                  ) : (
                    "順番待ち"
                  )}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                  {i + 1}. {sceneText(s.scenes[i], usedName)}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {p.image && (
                    <a href={p.image} download={`${s.id}-${String(i + 1).padStart(2, "0")}.png`} style={{ fontSize: 13 }}>
                      保存
                    </a>
                  )}
                  {(p.status === "done" || p.status === "error") && (
                    <button type="button" onClick={() => retry(s.id, i)} style={{ fontSize: 13, background: "none", border: 0, color: "var(--blue)", textDecoration: "underline", cursor: "pointer", padding: 0 }}>
                      作り直す
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
