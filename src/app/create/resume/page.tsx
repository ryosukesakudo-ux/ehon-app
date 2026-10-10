"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFlow } from "../flow";

// 会員ページの「つづきから」。保存されている下書きを読み込んで、プレビュー画面へ進む。
// ?saved=1 のときは、作成画面の「保存して中断」で保存した途中の内容から、保存した画面へ戻る。
function Resume() {
  const router = useRouter();
  const params = useSearchParams();
  const { update } = useFlow();
  const [error, setError] = useState<string | null>(null);
  const draftId = params.get("draft");
  const saved = params.get("saved") === "1";

  useEffect(() => {
    if (!saved) return;
    (async () => {
      const res = await fetch("/api/flow-save");
      const json = await res.json();
      const save = json?.save;
      if (!save) throw new Error("保存した下書きが見つかりません");
      let path: string = save.path;
      let patch: Record<string, unknown> = {
        taste: save.taste,
        story: save.story,
        childName: save.childName,
        childAge: save.childAge,
        childBirthday: save.childBirthday ?? "",
        draftId: null,
        demo: false,
        previews: {},
        previewScenes: [],
        size: save.size,
        copies: save.copies,
        deliveryDate: save.deliveryDate,
        deliveryTime: save.deliveryTime,
      };
      if (save.draftId) {
        // 写真を送ったあとなら、作成済みの絵（一時URL）を読み直す。消えていたら写真えらびからやり直す
        const d = await fetch(`/api/drafts/${encodeURIComponent(save.draftId)}`);
        if (d.ok) {
          const dj = await d.json();
          patch = { ...patch, draftId: save.draftId, previews: dj.previews, previewScenes: dj.previewScenes ?? [] };
        } else {
          path = "/create/photo";
        }
      } else if (path !== "/create/taste" && path !== "/create/story") {
        path = "/create/photo";
      }
      update(patch);
      router.replace(path);
    })().catch((e) => setError(e instanceof Error ? e.message : "読み込めませんでした"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 開いたときに一度だけ読み込む
  }, [saved]);

  useEffect(() => {
    if (!draftId) return;
    fetch(`/api/drafts/${encodeURIComponent(draftId)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "読み込めませんでした");
        update((prev) => ({
          taste: json.taste,
          story: json.story,
          childName: json.childName,
          childAge: json.childAge ?? null,
          // お誕生日は下書きに保存していないので、同じ主人公のときだけ残す
          childBirthday: prev.childName === json.childName ? prev.childBirthday : "",
          draftId,
          demo: false,
          previews: json.previews,
          previewScenes: json.previewScenes ?? [],
        }));
        router.replace("/create/preview");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "読み込めませんでした"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 開いたときに一度だけ読み込む
  }, [draftId]);

  return (
    <main className="step-body" style={{ alignItems: "center", paddingTop: 80 }}>
      {error || (!draftId && !saved) ? (
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
