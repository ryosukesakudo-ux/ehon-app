"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReviewToggle({ id, hidden }: { id: string; hidden: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="ghost"
      style={{ height: 34, padding: "0 12px", fontSize: 13, alignSelf: "flex-start" }}
      disabled={busy}
      onClick={async () => {
        if (!hidden && !confirm("このレビューをサイトから非表示にします。よろしいですか？（お礼のクーポンはそのまま使えます）")) return;
        setBusy(true);
        try {
          const res = await fetch("/api/admin/reviews", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, hidden: !hidden }) });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error ?? "失敗しました");
          router.refresh();
        } catch (err) {
          alert(err instanceof Error ? err.message : "失敗しました");
        } finally {
          setBusy(false);
        }
      }}
    >
      {hidden ? "非表示中（公開に戻す）" : "公開中（非表示にする）"}
    </button>
  );
}
