"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OrderActions({
  orderId,
  status,
  scenes,
  doneScenes,
  printSizes,
}: {
  orderId: string;
  status: string;
  /** 本番で作る絵の番号（表紙＋全場面） */
  scenes: number[];
  /** 本番の絵ができている場面（作り直さずに飛ばす） */
  doneScenes: number[];
  /** 入稿用PDFを作るサイズ（注文のサイズと、2冊目があればM） */
  printSizes: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfs, setPdfs] = useState<Record<string, { body: string; cover: string }>>({});

  async function call(path: string) {
    const res = await fetch(`/api/admin/orders/${orderId}/${path}`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `失敗しました (${res.status})`);
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
      // 途中まで作れた絵を一覧に出す
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  // まだ無い場面を1つずつ順番に作る（1枚あたり1分前後かかる）。途中で止まっても、押し直せば続きから作る
  const todo = scenes.filter((i) => !doneScenes.includes(i));
  const generateAll = () =>
    run("generate", async () => {
      for (const [n, i] of todo.entries()) {
        setBusy(`generate:${doneScenes.length + n + 1}/${scenes.length}`);
        await call(`scenes/${i}`);
      }
    });

  // 入稿用PDF（本文・表紙）を作って、ダウンロードのリンクを出す（リンクは1時間有効）
  const makePdf = (size: string) =>
    run(`pdf:${size}`, async () => {
      const res = await fetch(`/api/admin/orders/${orderId}/print`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ size }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `失敗しました (${res.status})`);
      setPdfs((p) => ({ ...p, [size]: json.urls }));
    });

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {status === "paid" && (
        <>
          <button type="button" className="ghost" disabled={!!busy || todo.length === 0} onClick={generateAll}>
            {busy?.startsWith("generate")
              ? `作成中 ${busy.split(":")[1] ?? ""}`
              : todo.length === 0
                ? "全ページの絵ができています"
                : doneScenes.length
                  ? `続きの絵を作る（残り${todo.length}枚）`
                  : "全ページの絵を作る（印刷用）"}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={!!busy}
            onClick={() => {
              if (confirm("制作完了にします。よろしいですか？"))
                run("complete", () => call("complete"));
            }}
          >
            制作完了にする
          </button>
        </>
      )}
      {status === "generated" && (
        <button type="button" className="ghost" disabled={!!busy} onClick={() => run("ship", () => call("ship"))}>
          発送済みにする
        </button>
      )}
      {status !== "pending" &&
        printSizes.map((size) => (
          <span key={size} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="ghost" disabled={!!busy} onClick={() => makePdf(size)}>
              {busy === `pdf:${size}` ? "PDFを作成中…" : `入稿用PDFを作る（${size}サイズ）`}
            </button>
            {pdfs[size] && (
              <>
                <a href={pdfs[size].body}>本文PDF</a>
                <a href={pdfs[size].cover}>表紙PDF</a>
              </>
            )}
          </span>
        ))}
      {error && <p className="error" role="alert" style={{ width: "100%" }}>{error}</p>}
    </div>
  );
}
