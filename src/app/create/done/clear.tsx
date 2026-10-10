"use client";

import { useEffect } from "react";

// 注文が終わったら、入力途中の内容を消す
export function ClearFlow() {
  useEffect(() => {
    try {
      // 会員がこの絵本を下書き保存していたら、注文が終わったので消す（別の絵本の下書きは残す）
      const draftId = JSON.parse(sessionStorage.getItem("ehon-flow") ?? "{}")?.draftId;
      if (draftId) fetch(`/api/flow-save?draft=${encodeURIComponent(draftId)}`, { method: "DELETE" }).catch(() => {});
      sessionStorage.removeItem("ehon-flow");
    } catch {}
  }, []);
  return null;
}
