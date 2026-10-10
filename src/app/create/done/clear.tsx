"use client";

import { useEffect } from "react";
import { clearLocalFlow, readLocalFlow } from "../flow-storage";

// 注文が終わったら、入力途中の内容を消す
export function ClearFlow() {
  useEffect(() => {
    try {
      // 会員がこの絵本を下書き保存していたら、注文が終わったので消す（別の絵本の下書きは残す）
      const draftId = readLocalFlow()?.draftId;
      if (typeof draftId === "string") fetch(`/api/flow-save?draft=${encodeURIComponent(draftId)}`, { method: "DELETE" }).catch(() => {});
      clearLocalFlow();
    } catch {}
  }, []);
  return null;
}
