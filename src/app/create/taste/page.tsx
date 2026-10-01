"use client";

import { TASTES } from "@/lib/catalog";
import { Check } from "@/components/icons";
import { useFlow } from "../flow";
import { NextButton, StepHeader, StepTitle } from "../step";

export default function TastePage() {
  const { state, update } = useFlow();
  return (
    <>
      <StepHeader step={1} />
      <main className="step-body">
        <StepTitle title="絵のテイストを選んでください" lead="絵本全体のタッチになります。" />
        {TASTES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="choice"
            aria-pressed={state.taste === t.id}
            onClick={() => update({ taste: t.id, previews: {}, draftId: null })}
          >
            <div
              style={{ flexShrink: 0, width: 96, height: 96, borderRadius: 12, background: t.swatch, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--sub)" }}
            >
              [見本画像]
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flexGrow: 1 }}>
              <div className="choice-title display" style={{ fontSize: 18 }}>{t.name}</div>
              <div className="choice-desc">{t.description}</div>
            </div>
            {state.taste === t.id && <div className="check"><Check /></div>}
          </button>
        ))}
      </main>
      <NextButton href="/create/story">次へ：ストーリーを選ぶ</NextButton>
    </>
  );
}
