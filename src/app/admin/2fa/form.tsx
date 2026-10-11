"use client";

import { useState } from "react";

export function CodeForm({ next }: { next: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/2fa", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      location.href = next;
      return;
    }
    const body = await res.json().catch(() => null);
    setError(body?.error ?? "うまくいきませんでした。もう一度お試しください");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        placeholder="123456"
        style={{ fontSize: 24, letterSpacing: 4, width: 160, padding: "6px 10px" }}
      />
      <button type="submit" className="ghost" disabled={busy || code.length !== 6}>
        確認
      </button>
      {error && <p style={{ margin: 0, width: "100%", color: "#c0392b" }}>{error}</p>}
    </form>
  );
}
