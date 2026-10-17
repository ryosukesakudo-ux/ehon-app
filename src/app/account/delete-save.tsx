"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { clearLocalFlow } from "../create/flow-storage";

// マイページの「つくりかけの絵本」（アカウントに保存した下書き）。
// 消すときは、押した時点でカードを隠して、消す処理と画面の読み直しは裏で行う
// （マイページの読み直しに時間がかかり「消しています…」のまま待たされていたため。2026-10-17 作道さん）。
export function SavedDraftCard({ note, children }: { note?: ReactNode; children: ReactNode }) {
  const router = useRouter();
  const [gone, setGone] = useState(false);

  async function remove() {
    if (!confirm("つくりかけの下書きを消しますか？")) return;
    setGone(true);
    // このブラウザに残っている作りかけも消す（残っているとマイページを開き直したときにアカウントへ引き継がれ、消えないように見える）
    clearLocalFlow();
    const res = await fetch("/api/flow-save", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      const json = await res?.json().catch(() => ({}));
      setGone(false);
      alert(json?.error ?? "消せませんでした");
      return;
    }
    router.replace("/account");
  }

  if (gone) return null;
  return (
    <>
      {note}
      <section className="card" style={{ gap: 10, border: "2px solid var(--coral)" }}>
        {children}
        <button type="button" className="link-button" onClick={remove} style={{ alignSelf: "center", fontSize: 13, color: "var(--sub)" }}>
          この下書きを消す（下書きは1件だけ保存できます）
        </button>
      </section>
    </>
  );
}
