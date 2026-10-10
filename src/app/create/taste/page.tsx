"use client";

import { TASTES } from "@/lib/catalog";
import { Check } from "@/components/icons";
import { SampleImage } from "@/components/sample-image";
import { sampleUrl } from "@/lib/samples";
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
            className="choice taste-choice"
            aria-pressed={state.taste === t.id}
            onClick={() => update({ taste: t.id, previews: {}, draftId: null })}
          >
            {/* タッチの違いが分かるよう、絵を大きく見せる */}
            <div className="taste-art" style={{ background: t.swatch }}>
              <SampleImage src={sampleUrl(t.id, state.story, 0)} alt={`${t.name}の見本`} fallback="[見本画像]" style={{ objectPosition: "50% 40%" }} sizes="(max-width: 480px) 100vw, 440px" />
              {state.taste === t.id && <div className="check taste-check"><Check /></div>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "2px 4px 4px" }}>
              <div className="choice-title display" style={{ fontSize: 19 }}>{t.name}</div>
              <div className="choice-desc">{t.description}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {t.points.map((p) => <span key={p} className="point">{p}</span>)}
              </div>
            </div>
          </button>
        ))}
      </main>
      <NextButton href="/create/story">次へ：ストーリーを選ぶ</NextButton>
    </>
  );
}
