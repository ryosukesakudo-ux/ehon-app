"use client";

import { useEffect } from "react";

// 注文が終わったら、入力途中の内容を消す
export function ClearFlow() {
  useEffect(() => {
    try {
      sessionStorage.removeItem("ehon-flow");
    } catch {}
  }, []);
  return null;
}
