"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OrderActions({ orderId, status, sceneCount }: { orderId: string; status: string; sceneCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    } finally {
      setBusy(null);
    }
  }

  // 1場面ずつ順番に作る（1枚あたり1分前後かかる）
  const generateAll = () =>
    run("generate", async () => {
      for (let i = 0; i < sceneCount; i++) {
        setBusy(`generate:${i + 1}/${sceneCount}`);
        await call(`scenes/${i}`);
      }
    });

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {status === "paid" && (
        <>
          <button type="button" className="ghost" disabled={!!busy} onClick={generateAll}>
            {busy?.startsWith("generate") ? `作成中 ${busy.split(":")[1] ?? ""}` : "全ページの絵を作る（印刷用）"}
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
      {error && <p className="error" role="alert" style={{ width: "100%" }}>{error}</p>}
    </div>
  );
}
