"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteSaveButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("つくりかけの下書きを消しますか？")) return;
    setBusy(true);
    const res = await fetch("/api/flow-save", { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) alert(json.error ?? "消せませんでした");
    setBusy(false);
    router.replace("/account");
    router.refresh();
  }

  return (
    <button type="button" className="link-button" onClick={remove} disabled={busy} style={{ alignSelf: "center", fontSize: 13, color: "var(--sub)" }}>
      {busy ? "消しています…" : "この下書きを消す（下書きは1件だけ保存できます）"}
    </button>
  );
}
