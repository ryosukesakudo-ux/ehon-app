"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 注文していない作りかけの絵本を、マイページから消す
export function DeleteDraftButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("この絵本を消しますか？作ったプレビューの絵も消え、元に戻せません。（写真と保存しているキャラクターは残ります）")) return;
    setBusy(true);
    const res = await fetch(`/api/drafts/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) alert(json.error ?? "消せませんでした");
    setBusy(false);
    router.refresh();
  }

  return (
    <button type="button" className="link-button" onClick={remove} disabled={busy} style={{ alignSelf: "center", fontSize: 13, color: "var(--sub)" }}>
      {busy ? "消しています…" : "この絵本を消す"}
    </button>
  );
}
