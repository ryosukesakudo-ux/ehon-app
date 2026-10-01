"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeletePhotoButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("この写真を削除しますか？（元に戻せません）")) return;
    setBusy(true);
    const res = await fetch(`/api/account/photos/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) alert(json.error ?? "削除に失敗しました");
    setBusy(false);
    router.refresh();
  }

  return (
    <button type="button" className="ghost" onClick={remove} disabled={busy} style={{ height: 36, padding: 0, fontSize: 13, borderColor: "#d9cfbd", color: "var(--sub)" }}>
      {busy ? "削除中…" : "削除"}
    </button>
  );
}
