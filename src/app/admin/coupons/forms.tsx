"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function send(method: "POST" | "PATCH", body: unknown) {
  const res = await fetch("/api/admin/coupons", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `失敗しました (${res.status})`);
}

/** 新しいクーポンを発行する */
export function CouponForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("1500");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="card"
      style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await send("POST", { code, label, bookPrice: Number(price) });
          setCode("");
          setLabel("");
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "失敗しました");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        コード（英数字）
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="FRIEND-1500" required />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        名前
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="友人用1500円" required />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        1冊目の値段（円・0で無料）
        <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 120 }} required />
      </label>
      <button type="submit" className="ghost" disabled={busy}>{busy ? "発行中…" : "発行する"}</button>
      {error && <p className="error" role="alert" style={{ width: "100%" }}>{error}</p>}
    </form>
  );
}

/** 使える・使えないの切り替え */
export function CouponToggle({ code, active }: { code: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="ghost"
      style={{ height: 34, padding: "0 12px", fontSize: 13 }}
      disabled={busy}
      onClick={async () => {
        if (active && !confirm(`${code} を使えなくします。よろしいですか？`)) return;
        setBusy(true);
        try {
          await send("PATCH", { code, active: !active });
          router.refresh();
        } catch (err) {
          alert(err instanceof Error ? err.message : "失敗しました");
        } finally {
          setBusy(false);
        }
      }}
    >
      {active ? "使える（止める）" : "停止中（再開する）"}
    </button>
  );
}
