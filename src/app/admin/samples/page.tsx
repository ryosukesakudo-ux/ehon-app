"use client";

import { useState } from "react";
import { STORIES, TASTES, sceneText, type StoryId, type TasteId } from "@/lib/catalog";
import {
  SAMPLE_CHILD_NAME,
  SAMPLE_SCENES,
  HERO_BOOK_PHOTO,
  SHOWCASE_BOOK,
  SHOWCASE_PHOTO,
  characterSheetPath,
  samplePublicUrl,
  sampleUrl,
} from "@/lib/samples";
import { SampleImage } from "@/components/sample-image";

// 作例スタジオ：実在しない家族で、トップページ・テイスト選択・お話選択に載せる見本の絵を作る。
// お話ごとにまずキャラクター設定画を作り（3枚）、それをもとに 3テイスト × 3話 × 見本の3場面 = 27枚 を作る。
// 中画質で約450円、高画質で約850〜1,050円（目安）。

const PARALLEL = 3;
type Key = `${TasteId}/${StoryId}/${number}`;

export default function SamplesPage() {
  const [quality, setQuality] = useState<"preview" | "final">("preview");
  const [busy, setBusy] = useState<Record<Key, boolean>>({});
  const [errors, setErrors] = useState<Record<Key, string>>({});
  const [version, setVersion] = useState<Record<Key, number>>({});

  async function make(taste: TasteId, story: StoryId, scene: number) {
    const key: Key = `${taste}/${story}/${scene}`;
    setBusy((b) => ({ ...b, [key]: true }));
    setErrors((e) => ({ ...e, [key]: "" }));
    try {
      const res = await fetch("/api/admin/samples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taste, story, scene, quality }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "作成に失敗しました");
      setVersion((v) => ({ ...v, [key]: Date.now() }));
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: e instanceof Error ? e.message : "作成に失敗しました" }));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  const [sheetBusy, setSheetBusy] = useState<Partial<Record<StoryId, boolean>>>({});
  const [sheetErrors, setSheetErrors] = useState<Partial<Record<StoryId, string>>>({});
  const [sheetVersion, setSheetVersion] = useState<Partial<Record<StoryId, number>>>({});

  async function makeSheet(story: StoryId) {
    setSheetBusy((b) => ({ ...b, [story]: true }));
    setSheetErrors((e) => ({ ...e, [story]: "" }));
    try {
      const res = await fetch("/api/admin/samples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "character", story }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "作成に失敗しました");
      setSheetVersion((v) => ({ ...v, [story]: Date.now() }));
      return true;
    } catch (e) {
      setSheetErrors((x) => ({ ...x, [story]: e instanceof Error ? e.message : "作成に失敗しました" }));
      return false;
    } finally {
      setSheetBusy((b) => ({ ...b, [story]: false }));
    }
  }

  // まだ設定画の無いお話だけ、先に設定画を作る
  async function ensureSheet(story: StoryId) {
    const url = samplePublicUrl(characterSheetPath(story));
    const exists = url ? await fetch(url, { method: "HEAD", cache: "no-store" }).then((r) => r.ok).catch(() => false) : false;
    return exists || makeSheet(story);
  }

  async function makeAll() {
    if (!confirm(`キャラクター設定画（未作成のお話のみ）と見本27枚をまとめて作ります（${quality === "final" ? "高画質" : "中画質"}）。よろしいですか？`)) return;
    const ready = await Promise.all(STORIES.map((s) => ensureSheet(s.id)));
    const okStories = new Set(STORIES.filter((_, i) => ready[i]).map((s) => s.id));
    const jobs = TASTES.flatMap((t) =>
      STORIES.filter((s) => okStories.has(s.id)).flatMap((s) => SAMPLE_SCENES.map((sc) => () => make(t.id, s.id, sc))),
    );
    const run = async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) await job();
    };
    await Promise.all(Array.from({ length: PARALLEL }, run));
  }

  const [showcaseBusy, setShowcaseBusy] = useState<"photo" | "book" | "hero" | null>(null);
  const [showcaseError, setShowcaseError] = useState<string | null>(null);
  const [showcaseVersion, setShowcaseVersion] = useState(0);

  async function makeShowcase(step: "photo" | "book" | "hero") {
    setShowcaseBusy(step);
    setShowcaseError(null);
    try {
      const res = await fetch("/api/admin/samples/showcase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "作成に失敗しました");
      setShowcaseVersion(Date.now());
    } catch (e) {
      setShowcaseError(e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setShowcaseBusy(null);
    }
  }

  const anyBusy = Object.values(busy).some(Boolean) || Object.values(sheetBusy).some(Boolean);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <a href="/admin">← 注文管理へ</a>
      <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>作例スタジオ</h1>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8 }}>
        実在しない家族（主人公「{SAMPLE_CHILD_NAME}」）で見本の絵を作ります。作った絵はすぐにトップページ・テイスト選択・お話選択に表示されます（反映まで最大5分）。
      </p>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          画質：
          <select value={quality} onChange={(e) => setQuality(e.target.value as "preview" | "final")}>
            <option value="preview">中画質（1枚 約15円）</option>
            <option value="final">高画質（1枚 約30円）</option>
          </select>
        </label>
        <button type="button" className="cta" style={{ width: "auto", height: 48, padding: "0 24px", fontSize: 16 }} disabled={anyBusy} onClick={makeAll}>
          まとめて作る（設定画＋見本27枚）
        </button>
      </div>
      <section className="card" style={{ gap: 14 }}>
        <h2 className="display" style={{ margin: 0, fontSize: 18, color: "var(--navy)" }}>トップの一番上の絵本の写真</h2>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
          「もりのだいぼうけん」の水彩の1枚目を表紙にした、製本済みの絵本の写真風の画像を作ります（1枚 約40円）。表紙の文字が崩れたときは作り直してください。まだ無いときは、画面上で描いた絵本が表示されます。
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 320 }}>
          <div style={{ aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", background: "#eee", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {showcaseBusy === "hero" ? (
              <div className="spinner" />
            ) : (
              <SampleImage
                key={showcaseVersion}
                src={samplePublicUrl(HERO_BOOK_PHOTO) && `${samplePublicUrl(HERO_BOOK_PHOTO)}?v=${showcaseVersion}`}
                alt="トップの絵本の写真"
                fallback={<span style={{ color: "#888" }}>未作成</span>}
              />
            )}
          </div>
          <button type="button" className="ghost" style={{ height: 40 }} disabled={!!showcaseBusy} onClick={() => makeShowcase("hero")}>
            絵本の写真を作る／作り直す
          </button>
        </div>
        {showcaseError && <span className="error">{showcaseError}</span>}
      </section>
      <section className="card" style={{ gap: 14 }}>
        <h2 className="display" style={{ margin: 0, fontSize: 18, color: "var(--navy)" }}>トップの「この写真から → この絵本に」</h2>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
          ① 架空の家族（子ども・ママ・パパ）の写真風の画像を作る → ② その画像から絵本の1場面を作る、の順に押してください。①を作り直したら②も作り直します。
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {([["photo", SHOWCASE_PHOTO, "① 写真風の画像を作る"], ["book", SHOWCASE_BOOK, "② この画像から絵本の絵を作る"]] as const).map(([step, path, label]) => (
            <div key={step} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", background: "#eee", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {showcaseBusy === step ? (
                  <div className="spinner" />
                ) : (
                  <SampleImage
                    key={showcaseVersion}
                    src={samplePublicUrl(path) && `${samplePublicUrl(path)}?v=${showcaseVersion}`}
                    alt={label}
                    fallback={<span style={{ color: "#888" }}>未作成</span>}
                  />
                )}
              </div>
              <button type="button" className="ghost" style={{ height: 40 }} disabled={!!showcaseBusy} onClick={() => makeShowcase(step)}>
                {label}
              </button>
            </div>
          ))}
        </div>
        {showcaseError && <span className="error">{showcaseError}</span>}
      </section>
      {STORIES.map((s) => (
        <section key={s.id} className="card" style={{ gap: 14 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 18, color: "var(--navy)" }}>{s.name}</h2>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ width: 200, aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", background: "#eee", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {sheetBusy[s.id] ? (
                <div className="spinner" />
              ) : (
                <SampleImage
                  key={sheetVersion[s.id] ?? 0}
                  src={samplePublicUrl(characterSheetPath(s.id)) && `${samplePublicUrl(characterSheetPath(s.id))}?v=${sheetVersion[s.id] ?? 0}`}
                  alt={`${s.name}のキャラクター設定画`}
                  fallback={<span style={{ color: "#888" }}>未作成</span>}
                />
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 260px", fontSize: 13, lineHeight: 1.7 }}>
              <strong>キャラクター設定画</strong>
              <span>このお話の登場人物の顔・体つき・服装を決める1枚です。下の見本はすべてこの絵をもとに描くので、テイストが違っても同じ人物・同じ服装になります。作り直したら、下の見本も作り直してください。</span>
              <button type="button" className="ghost" style={{ height: 40, alignSelf: "flex-start" }} disabled={anyBusy} onClick={() => makeSheet(s.id)}>
                キャラクター設定画を作る／作り直す
              </button>
              {sheetErrors[s.id] && <span className="error">{sheetErrors[s.id]}</span>}
            </div>
          </div>
          {TASTES.map((t) => (
            <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <strong style={{ fontSize: 14 }}>{t.name}</strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                {SAMPLE_SCENES.map((sc) => {
                  const key: Key = `${t.id}/${s.id}/${sc}`;
                  const url = sampleUrl(t.id, s.id, sc);
                  return (
                    <div key={key} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, lineHeight: 1.6 }}>
                      <div style={{ aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", background: "#eee", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {busy[key] ? (
                          <div className="spinner" />
                        ) : (
                          <SampleImage
                            key={version[key] ?? 0}
                            src={url && `${url}?v=${version[key] ?? 0}`}
                            alt={`${s.name} ${t.name} 場面${sc + 1}`}
                            fallback={<span style={{ color: "#888" }}>未作成</span>}
                          />
                        )}
                      </div>
                      <div>場面{sc + 1}：{sceneText(s.scenes[sc], SAMPLE_CHILD_NAME)}</div>
                      <button type="button" className="ghost" style={{ height: 36 }} disabled={!!busy[key]} onClick={() => make(t.id, s.id, sc)}>
                        作る／作り直す
                      </button>
                      {errors[key] && <span className="error">{errors[key]}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
