"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SERIES_NOTE_MAX } from "@/lib/series";

// 注文の絵を作るときの画質。中画質が標準（2026-10-11 作道さん）。注文ごとに選び、全ページ作成と1枚の作り直しの両方に効く
type Detail = "medium" | "high";
const DetailContext = createContext<{ detail: Detail; setDetail: (d: Detail) => void }>({ detail: "medium", setDetail: () => {} });

export function OrderDetailProvider({ children }: { children: ReactNode }) {
  const [detail, setDetail] = useState<Detail>("medium");
  return <DetailContext.Provider value={{ detail, setDetail }}>{children}</DetailContext.Provider>;
}

function DetailSelect() {
  const { detail, setDetail } = useContext(DetailContext);
  return (
    <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      画質
      <select value={detail} onChange={(e) => setDetail(e.target.value as Detail)}>
        <option value="medium">中画質（1枚 約15円）</option>
        <option value="high">高画質（1枚 約50円）</option>
      </select>
    </label>
  );
}

// しまうまプリントのフォトブック（lib/shimauma.ts の SHIMAUMA_PRODUCTS と同じ）
const SHIMAUMA_BUTTONS = [
  { product: "a5square", label: "フォトブック 148mm角" },
  { product: "pictures", label: "PICTURES 182mm角" },
];

export function OrderActions({
  orderId,
  status,
  scenes,
  doneScenes,
  printSizes,
  amount,
  refunded,
}: {
  orderId: string;
  status: string;
  /** 本番で作る絵の番号（表紙＋全場面） */
  scenes: number[];
  /** 本番の絵ができている場面（作り直さずに飛ばす） */
  doneScenes: number[];
  /** 入稿用PDFを作るサイズ（注文と違うサイズで刷ることもあるので全サイズ） */
  printSizes: string[];
  /** お支払い額と返金済みの額（円） */
  amount: number;
  refunded: number;
}) {
  const router = useRouter();
  const { detail } = useContext(DetailContext);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfs, setPdfs] = useState<Record<string, { body: string; cover: string; spread: string }>>({});
  const [shimauma, setShimauma] = useState<Record<string, string>>({});
  // 製本直送.comの表紙画像の背幅（mm）。表紙アップロード画面の「表紙サイズが不明な方は、こちら」で確認した値を入れる
  const [spineMm, setSpineMm] = useState("2");
  const refundable = amount - refunded;
  const [refundAmount, setRefundAmount] = useState(String(refundable));

  const refund = () => {
    const yenAmount = Math.floor(Number(refundAmount));
    if (!(yenAmount >= 1 && yenAmount <= refundable)) {
      setError(`返金できるのは1円〜${refundable}円です`);
      return;
    }
    if (!confirm(`${yenAmount.toLocaleString()}円を返金します。取り消せません。よろしいですか？`)) return;
    run("refund", async () => {
      const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: yenAmount }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `失敗しました (${res.status})`);
    });
  };

  async function call(path: string, body?: object) {
    const res = await fetch(`/api/admin/orders/${orderId}/${path}`, {
      method: "POST",
      ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
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

  // まだ無い場面を1つずつ順番に作る（1枚あたり1分前後かかる）。途中で止まっても、押し直せば続きから作る。
  // お客様がプレビューで作った表紙・本文の絵は、描き直さずにそのまま使う（数秒で終わる）
  const todo = scenes.filter((i) => !doneScenes.includes(i));
  const generateAll = () =>
    run("generate", async () => {
      for (const [n, i] of todo.entries()) {
        setBusy(`generate:${doneScenes.length + n + 1}/${scenes.length}`);
        await call(`scenes/${i}`, { detail, reuse: true });
      }
    });

  // できている絵も含めて、全ページを1枚ずつ作り直す（服や持ち物の指示を直したあとなど）。途中で止まったら、残りは1ページずつ作り直す
  const redoAll = () => {
    const per = detail === "high" ? 50 : 15;
    if (!confirm(`全${scenes.length}ページの絵を作り直します（AI代 約${scenes.length * per}円）。今の絵は上書きされます。よろしいですか？`)) return;
    run("redoAll", async () => {
      for (const [n, i] of scenes.entries()) {
        setBusy(`redoAll:${n + 1}/${scenes.length}`);
        await call(`scenes/${i}`, { detail });
      }
    });
  };

  // 入稿用PDF（本文・表紙）と見開き表紙画像を作って、ダウンロードのリンクを出す（リンクは1時間有効）
  const makePdf = (size: string) =>
    run(`pdf:${size}`, async () => {
      const res = await fetch(`/api/admin/orders/${orderId}/print`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ size, spineMm: Number(spineMm) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `失敗しました (${res.status})`);
      setPdfs((p) => ({ ...p, [size]: json.urls }));
    });

  // しまうまプリントのフォトブック用の画像（表紙＋本文）をZIPで作る（リンクは1時間有効）
  const makeShimauma = (product: string) =>
    run(`shimauma:${product}`, async () => {
      const res = await fetch(`/api/admin/orders/${orderId}/shimauma`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `失敗しました (${res.status})`);
      setShimauma((s) => ({ ...s, [product]: json.url }));
    });

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {(status === "paid" || status === "generated") && <DetailSelect />}
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
      {(status === "paid" || status === "generated") && doneScenes.length > 0 && (
        <button type="button" className="ghost" disabled={!!busy} onClick={redoAll}>
          {busy?.startsWith("redoAll") ? `作り直し中 ${busy.split(":")[1]}` : "全ページ作り直す"}
        </button>
      )}
      {status === "generated" && (
        <button type="button" className="ghost" disabled={!!busy} onClick={() => run("ship", () => call("ship"))}>
          発送済みにする
        </button>
      )}
      {status !== "pending" && (
        <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          背幅
          <input type="number" min={0} max={30} step={0.1} value={spineMm} onChange={(e) => setSpineMm(e.target.value)} style={{ width: 64 }} />
          mm
        </label>
      )}
      {status !== "pending" &&
        printSizes.map((size) => (
          <span key={size} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="ghost" disabled={!!busy} onClick={() => makePdf(size)}>
              {busy === `pdf:${size}` ? "PDFを作成中…" : `入稿用PDFを作る（${size === "S" ? "ソフト" : "ハード"}カバー・182mm角）`}
            </button>
            {pdfs[size] && (
              <>
                <a href={pdfs[size].body}>本文PDF</a>
                <a href={pdfs[size].cover}>表紙PDF</a>
                <a href={pdfs[size].spread}>表紙画像（製本直送用）</a>
              </>
            )}
          </span>
        ))}
      {status !== "pending" &&
        SHIMAUMA_BUTTONS.map(({ product, label }) => (
          <span key={product} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="ghost" disabled={!!busy} onClick={() => makeShimauma(product)}>
              {busy === `shimauma:${product}` ? "画像を作成中…" : `しまうま用の画像を作る（${label}）`}
            </button>
            {shimauma[product] && <a href={shimauma[product]}>しまうま用の画像（{label}・ZIP）</a>}
          </span>
        ))}
      {status !== "pending" && refundable > 0 && (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          返金
          <input type="number" min={1} max={refundable} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} style={{ width: 90 }} aria-label="返金する金額" />
          円
          <button type="button" className="ghost" disabled={!!busy} onClick={refund}>
            {busy === "refund" ? "返金中…" : refundAmount === String(refundable) ? "全額返金する" : "一部返金する"}
          </button>
        </span>
      )}
      {error && <p className="error" role="alert" style={{ width: "100%" }}>{error}</p>}
    </div>
  );
}

/** 1ページだけ印刷用の絵を作り直す（お客様の本の不具合を直すとき。1分前後。画質は注文の「画質」の選択に従う） */
export function RedoSceneButton({ orderId, scene }: { orderId: string; scene: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const { detail } = useContext(DetailContext);
  const redo = async () => {
    if (!confirm("この絵を作り直します。今の絵は上書きされます。よろしいですか？")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/scenes/${scene}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note, detail }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `失敗しました (${res.status})`);
      setNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={SERIES_NOTE_MAX}
        rows={2}
        placeholder="作り直しの指示（任意）例：主人公の顔をもっと笑顔に"
        aria-label="作り直しの指示"
        style={{ width: "100%", fontSize: 12, marginTop: 4 }}
      />
      <button type="button" className="ghost" disabled={busy} onClick={redo} style={{ fontSize: 12, padding: "2px 8px" }}>
        {busy ? "作り直し中…" : "この絵を作り直す"}
      </button>
      {error && <span className="error" role="alert"> {error}</span>}
    </>
  );
}
