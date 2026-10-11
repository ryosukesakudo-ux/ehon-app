"use client";

import { useState } from "react";
import { SAMPLE_CHILD_NAME, samplePublicUrl } from "@/lib/samples";
import { SERIES, seriesImagePath, seriesSheetPath, type SeriesId } from "@/lib/series";
import { SampleImage } from "@/components/sample-image";

// 台本の絵スタジオ：作例と同じ架空の家族で、台本（シリーズ）の各話の表紙と12場面を水彩で作る。
// ① 登場人物の設定画（家族＋相棒）→ ② 話ごとに「まとめて作る」。気に入らない絵は1枚ずつ作り直せる。

const PARALLEL = 3;
const SERIES_ID: SeriesId = "forest";
type Key = `${number}/${number}`;

export default function SeriesPage() {
  const series = SERIES[SERIES_ID];
  const [quality, setQuality] = useState<"preview" | "final">("final");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [version, setVersion] = useState<Record<string, number>>({});

  async function call(key: string, body: object) {
    setBusy((b) => ({ ...b, [key]: true }));
    setErrors((e) => ({ ...e, [key]: "" }));
    try {
      const res = await fetch("/api/admin/series", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ series: SERIES_ID, ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "作成に失敗しました");
      setVersion((v) => ({ ...v, [key]: Date.now() }));
      return true;
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: e instanceof Error ? e.message : "作成に失敗しました" }));
      return false;
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  const makeSheet = () => call("sheet", { kind: "sheet" });
  const makePage = (episode: number, page: number) => call(`${episode}/${page}` satisfies Key, { episode, page, quality });

  async function sheetExists() {
    const url = samplePublicUrl(seriesSheetPath(SERIES_ID));
    return url ? fetch(url, { method: "HEAD", cache: "no-store" }).then((r) => r.ok).catch(() => false) : false;
  }

  async function makeEpisode(no: number) {
    const per = quality === "final" ? 30 : 15;
    if (!confirm(`第${no}話の表紙と12場面（13枚）をまとめて作ります。AI代は約${13 * per}円です。よろしいですか？`)) return;
    if (!(await sheetExists()) && !(await makeSheet())) return;
    const jobs = Array.from({ length: 13 }, (_, page) => () => makePage(no, page));
    const run = async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) await job();
    };
    await Promise.all(Array.from({ length: PARALLEL }, run));
  }

  const anyBusy = Object.values(busy).some(Boolean);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <a href="/admin">← 注文管理へ</a>
      <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>台本の絵スタジオ</h1>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8 }}>
        作例と同じ架空の家族（主人公「{SAMPLE_CHILD_NAME}」とママ・パパ）で、「{series.name}」の台本の絵を水彩で作ります。サイトのお客様向けの画面には出ません。
        まず「まとめて作る」を押してください（登場人物の設定画がまだなければ先に作ります）。気に入らない絵は、その絵の下のボタンで1枚ずつ作り直せます。
      </p>
      <label>
        画質：
        <select value={quality} onChange={(e) => setQuality(e.target.value as "preview" | "final")}>
          <option value="final">高画質（1枚 約30円）</option>
          <option value="preview">中画質（1枚 約15円）</option>
        </select>
      </label>

      <section className="card" style={{ gap: 12 }}>
        <h2 className="display" style={{ margin: 0, fontSize: 18, color: "var(--navy)" }}>登場人物の設定画</h2>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
          作例スタジオの「{series.name}」の設定画（家族3人）に、{series.sidekickLabel}を加えた1枚です。すべての場面がこの絵をもとに描かれます。作り直したら、場面も作り直してください（1枚 約50円）。
        </p>
        <Tile
          path={seriesSheetPath(SERIES_ID)}
          version={version.sheet}
          busy={busy.sheet}
          error={errors.sheet}
          label="家族＋相棒の設定画"
          aspect="3 / 2"
          width={420}
          onMake={makeSheet}
          disabled={anyBusy}
        />
      </section>

      {series.episodes.map((ep) => (
        <section key={ep.no} className="card" style={{ gap: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
            <h2 className="display" style={{ margin: 0, fontSize: 18, color: "var(--navy)" }}>
              第{ep.no}話「{ep.title}」
            </h2>
            <button type="button" className="cta" style={{ width: "auto", height: 44, padding: "0 20px", fontSize: 15 }} disabled={anyBusy} onClick={() => makeEpisode(ep.no)}>
              まとめて作る（表紙＋12場面）
            </button>
          </div>
          <Tile
            path={seriesImagePath(SERIES_ID, ep.no, 0)}
            version={version[`${ep.no}/0`]}
            busy={busy[`${ep.no}/0`]}
            error={errors[`${ep.no}/0`]}
            label={`表紙：${ep.cover.label}`}
            aspect="3 / 2"
            width={420}
            onMake={() => makePage(ep.no, 0)}
            disabled={anyBusy}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {ep.scenes.map((sc, i) => (
              <Tile
                key={i}
                path={seriesImagePath(SERIES_ID, ep.no, i + 1)}
                version={version[`${ep.no}/${i + 1}`]}
                busy={busy[`${ep.no}/${i + 1}`]}
                error={errors[`${ep.no}/${i + 1}`]}
                label={`場面${i + 1}：${sc.label}`}
                onMake={() => makePage(ep.no, i + 1)}
                disabled={anyBusy}
              />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function Tile(props: {
  path: string;
  version?: number;
  busy?: boolean;
  error?: string;
  label: string;
  aspect?: string;
  width?: number;
  disabled: boolean;
  onMake: () => void;
}) {
  const url = samplePublicUrl(props.path);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: props.width }}>
      <div
        style={{
          aspectRatio: props.aspect ?? "1 / 1",
          borderRadius: 10,
          overflow: "hidden",
          background: "#eee",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {props.busy ? (
          <div className="spinner" />
        ) : (
          <a href={url ?? undefined} target="_blank" rel="noreferrer" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SampleImage
              key={props.version ?? 0}
              src={url && `${url}?v=${props.version ?? 0}`}
              alt={props.label}
              fallback={<span style={{ color: "#888" }}>未作成</span>}
            />
          </a>
        )}
      </div>
      <span style={{ fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>{props.label}</span>
      <button type="button" className="ghost" style={{ height: 36 }} disabled={props.disabled} onClick={props.onMake}>
        作る／作り直す
      </button>
      {props.error && <span className="error">{props.error}</span>}
    </div>
  );
}
