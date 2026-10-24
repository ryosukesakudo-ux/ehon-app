"use client";

import { useState, type ReactNode } from "react";
import { MEMORY_PHOTO_MAX } from "@/lib/catalog";
import { StepDialog } from "./step-cards";
import { AlbumSample } from "./album-sample";
import s from "./top.module.css";

// トップの「思い出の写真を20枚まで」のカード。押すとページを移らずに説明をポップアップで出す（2026-10-24 作道さん）。
// ポップアップは「かんたん3ステップ」と同じ部品・見た目。
export function MemoryCallout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={s.memoryCallout} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {children}
      </button>
      {open && (
        <StepDialog id="memory-dialog" title={`思い出の写真を${MEMORY_PHOTO_MAX}枚まで`} onClose={() => setOpen(false)}>
          <p style={lead}>
            お好きな写真を{MEMORY_PHOTO_MAX}枚まで、お話のあとのアルバムページ（6ページ）に入れられます。家族からのメッセージページもつきます。
          </p>
          <AlbumSample />
          <ul className={s.stepList}>
            <li>写真はご注文の確認画面で入れます（無くても作れます）</li>
            <li>アップした順に6ページへ分けて並べます（1ページ最大4枚）</li>
            <li>写真は切らずに、そのままの形でのせます</li>
            <li>写真が足りないページは、おえかきページになります</li>
          </ul>
        </StepDialog>
      )}
    </>
  );
}

const lead = { margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--sub)" } as const;
