"use client";

import { useState } from "react";

/** まだ台本に入れていないメモをまとめてコピーする（Claude に貼って「台本に反映して」と頼むため） */
export function CopyNotes({ text, count }: { text: string; count: number }) {
  const [copied, setCopied] = useState(false);
  if (!count) return null;
  return (
    <button
      type="button"
      className="ghost"
      style={{ width: "auto", height: 40, padding: "0 16px", fontSize: 14, alignSelf: "flex-start" }}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }}
    >
      {copied ? "コピーしました。Claude に貼ってください" : `台本にまだ入れていないメモ ${count}件をコピー`}
    </button>
  );
}
