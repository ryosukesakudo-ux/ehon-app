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
  const [kind, setKind] = useState<"price" | "discount">("price");
  const [price, setPrice] = useState("1500");
  const [multiUse, setMultiUse] = useState(false);
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
          await send("POST", { code, label, kind, amount: Number(price), multiUse });
          setCode("");
          setLabel("");
          setMultiUse(false);
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
        種類
        <select value={kind} onChange={(e) => setKind(e.target.value as "price" | "discount")}>
          <option value="price">1冊目の値段にする</option>
          <option value="discount">1冊目から値引き</option>
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        {kind === "price" ? "1冊目の値段（円・0で無料）" : "値引き額（円）"}
        <input type="number" min={kind === "price" ? 0 : 1} value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 120 }} required />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, height: 40 }}>
        <input type="checkbox" checked={multiUse} onChange={(e) => setMultiUse(e.target.checked)} />
        同じ人が何回でも使える
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
