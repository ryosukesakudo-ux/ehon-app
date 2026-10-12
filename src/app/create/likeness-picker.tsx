"use client";

import { LIKENESS_LEVELS, type LikenessId } from "@/lib/catalog";

// 本人への似せ方（ふつう／しっかり／写真そっくり）を選ぶボタン。写真の画面とプレビューの作り直しで使う。
export function LikenessPicker({ value, onChange, label = "本人への似せ方" }: { value: LikenessId; onChange: (v: LikenessId) => void; label?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--navy)" }}>{label}</div>
      <div role="radiogroup" aria-label={label} style={{ display: "flex", gap: 6 }}>
        {LIKENESS_LEVELS.map((l) => {
          const on = value === l.id;
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(l.id)}
              style={{ flex: 1, minHeight: 40, padding: "4px 6px", borderRadius: 12, fontSize: 13, cursor: "pointer", border: on ? "2px solid var(--coral)" : "1px solid var(--line)", background: on ? "#FDECE8" : "#fff", color: "var(--navy)", fontWeight: on ? 800 : 500 }}
            >
              {l.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: "var(--sub)" }}>{LIKENESS_LEVELS.find((l) => l.id === value)?.hint}</div>
    </div>
  );
}
