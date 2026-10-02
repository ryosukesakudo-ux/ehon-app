"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFlow } from "../flow";

// 会員ページの「つづきから」。保存されている下書きを読み込んで、プレビュー画面へ進む。
function Resume() {
  const router = useRouter();
  const params = useSearchParams();
  const { update } = useFlow();
  const [error, setError] = useState<string | null>(null);
  const draftId = params.get("draft");

  useEffect(() => {
    if (!draftId) return;
    fetch(`/api/drafts/${encodeURIComponent(draftId)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "読み込めませんでした");
        update({ taste: json.taste, story: json.story, childName: json.childName, childAge: json.childAge ?? null, draftId, demo: false, previews: json.previews, previewScenes: json.previewScenes ?? [] });
        router.replace("/create/preview");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "読み込めませんでした"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 開いたときに一度だけ読み込む
  }, [draftId]);

  return (
    <main className="step-body" style={{ alignItems: "center", paddingTop: 80 }}>
      {error || !draftId ? (
        <p className="error" role="alert">{error ?? "下書きが指定されていません"}</p>
      ) : (
        <div className="spinner" />
      )}
    </main>
  );
}

export default function ResumePage() {
  return (
    <Suspense>
      <Resume />
    </Suspense>
  );
}
