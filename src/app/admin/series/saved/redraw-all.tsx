"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const PARALLEL = 3;
const pageLabel = (p: number) => (p === 0 ? "表紙" : `場面${p}`);

/**
 * 保存版のメモで、今の見本をまとめて作り直す（2026-10-20 作道さん「一括作り直しもいける？」）。
 * 1枚ごとのメモがある絵を作り直す。一式全体へのメモがあれば13枚すべてを作り直し、全体のメモを各絵のメモの前に付ける
 */
export function RedrawAll({ series, episode, stamp, notes }: { series: string; episode: number; stamp: string; notes: Record<string, string> }) {
  const router = useRouter();
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const all = notes.all ?? "";
  const pages = Array.from({ length: 13 }, (_, p) => p).filter((p) => all || notes[String(p)]);
  if (!pages.length) return null;

  async function post(url: string, body: object) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "うまくいきませんでした");
  }
  async function run() {
    const list = pages.map(pageLabel).join("・");
    if (!confirm(`保存済みのメモで、今の見本の ${pages.length}枚（${list}）をまとめて作り直します（AI代 約${pages.length * 15}円）。${all ? "\n全体へのメモは、すべての絵の指示に入ります。" : ""}\n作り直した絵はすぐ本番の見本に出ます。よろしいですか？`)) return;
    setErrors([]);
    let done = 0;
    setProgress(`0 / ${pages.length}`);
    const queue = [...pages];
    const failed: string[] = [];
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        for (let p = queue.shift(); p !== undefined; p = queue.shift()) {
          const note = [all, notes[String(p)] ?? ""].filter(Boolean).join("\n");
          try {
            await post("/api/admin/series", { series, episode, page: p, note, quality: "preview", wide: p > 0 });
            if (notes[String(p)]) await post("/api/admin/series/saved", { kind: "redrawn", series, episode, stamp, page: p });
          } catch (e) {
            failed.push(`${pageLabel(p)}：${e instanceof Error ? e.message : "作り直せませんでした"}`);
          }
          setProgress(`${++done} / ${pages.length}`);
        }
      }),
    );
    if (all && !failed.length) await post("/api/admin/series/saved", { kind: "redrawn", series, episode, stamp, page: "all" }).catch(() => {});
    setErrors(failed);
    setProgress("");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <button type="button" className="cta" style={{ width: "auto", height: 40, padding: "0 16px", fontSize: 14 }} disabled={!!progress} onClick={run}>
        {progress ? `作り直しています… ${progress}` : `メモのある絵をまとめて作り直す（${pages.length}枚）`}
      </button>
      {errors.map((e) => (
        <span key={e} className="error">{e}</span>
      ))}
    </div>
  );
}
