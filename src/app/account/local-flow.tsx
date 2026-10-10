"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasProgress, readLocalFlow } from "../create/flow-storage";

// ログインする前にこのブラウザで作りかけていた内容を、アカウントの「つくりかけの絵本」に引き継ぐ。
// アカウントに保存してある内容のほうが新しければ何もしない。
export function SyncLocalFlow({ savedAt }: { savedAt: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const local = readLocalFlow();
    if (!hasProgress(local)) return;
    const updatedAt = typeof local.updatedAt === "number" ? local.updatedAt : 0;
    if (savedAt && new Date(savedAt).getTime() >= updatedAt) return;
    fetch("/api/flow-save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(local) })
      .then((r) => r.ok && router.refresh())
      .catch(() => {});
  }, [savedAt, router]);
  return null;
}
