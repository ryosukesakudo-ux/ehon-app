"use client";

import { useState } from "react";
import { STORIES, TASTES, sceneText, type StoryId, type TasteId } from "@/lib/catalog";
import { SAMPLE_CHILD_NAME, SAMPLE_SCENES, sampleUrl } from "@/lib/samples";
import { SampleImage } from "@/components/sample-image";

// 作例スタジオ：実在しない家族で、トップページ・テイスト選択・お話選択に載せる見本の絵を作る。
// 3テイスト × 3話 × 見本の3場面 = 27枚。中画質で約400円、高画質で約800〜1,000円（目安）。

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

  async function makeAll() {
    if (!confirm(`27枚まとめて作ります（${quality === "final" ? "高画質" : "中画質"}）。よろしいですか？`)) return;
    const jobs = TASTES.flatMap((t) => STORIES.flatMap((s) => SAMPLE_SCENES.map((sc) => () => make(t.id, s.id, sc))));
    const run = async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) await job();
    };
    await Promise.all(Array.from({ length: PARALLEL }, run));
  }

  const anyBusy = Object.values(busy).some(Boolean);

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
          27枚まとめて作る
        </button>
      </div>
      {STORIES.map((s) => (
        <section key={s.id} className="card" style={{ gap: 14 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 18, color: "var(--navy)" }}>{s.name}</h2>
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
