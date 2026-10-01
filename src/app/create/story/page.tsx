"use client";

import { STORIES } from "@/lib/catalog";
import { Check } from "@/components/icons";
import { useFlow } from "../flow";
import { NextButton, StepHeader, StepTitle } from "../step";

export default function StoryPage() {
  const { state, update } = useFlow();
  const nameOk = state.childName.trim().length > 0 && state.childName.trim().length <= 12;
  return (
    <>
      <StepHeader step={2} back="/create/taste" />
      <main className="step-body">
        <StepTitle title="お話を選んでください" lead="主人公はお子さまです。名前は本文に入ります。" />
        {STORIES.map((s) => (
          <button
            key={s.id}
            type="button"
            className="choice"
            aria-pressed={state.story === s.id}
            onClick={() => update({ story: s.id, previews: {}, draftId: null })}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flexGrow: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div className="choice-title display">{s.name}</div>
                <div className="tag">{s.ages}</div>
              </div>
              <div className="choice-desc">{s.description}</div>
            </div>
            {state.story === s.id && <div className="check"><Check /></div>}
          </button>
        ))}
        <div className="field">
          <label htmlFor="childname" className="display">主人公の名前（ひらがな）</label>
          <input
            id="childname"
            type="text"
            placeholder="例：はると"
            maxLength={12}
            value={state.childName}
            onChange={(e) => update({ childName: e.target.value, previews: {}, draftId: null })}
          />
        </div>
      </main>
      <NextButton href="/create/photo" disabled={!nameOk}>次へ：写真をえらぶ</NextButton>
    </>
  );
}
