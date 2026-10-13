"use client";

import { STORIES, TASTES, type StoryId } from "@/lib/catalog";
import { parseSeriesKey } from "@/lib/story-key";
import { Check } from "@/components/icons";
import { SampleImage } from "@/components/sample-image";
import { sampleUrl } from "@/lib/samples";
import { useFlow } from "../flow";

/** 絵のテイスト。小さめのカードを横に3つ並べ、選んでいるタッチの説明を下に出す */
export function TasteSection() {
  const { state, update } = useFlow();
  // テイストごとの見本は旧版の3つのお話にある。シリーズを選んでいるときは同じ名前のお話（無ければ森）の見本を出す
  const id = parseSeriesKey(state.story)?.series ?? state.story;
  const sampleStory: StoryId = STORIES.find((s) => s.id === id)?.id ?? "forest";
  const picked = TASTES.find((t) => t.id === state.taste);
  return (
    <>
      <div className="taste-row" role="radiogroup" aria-label="絵のテイスト">
        {TASTES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            className="choice taste-choice"
            aria-checked={state.taste === t.id}
            onClick={() => state.taste !== t.id && update({ taste: t.id, previews: {}, draftId: null })}
          >
            <div className="taste-art" style={{ background: t.swatch }}>
              <SampleImage src={sampleUrl(t.id, sampleStory, 0)} alt={`${t.name}の見本`} fallback="[見本]" sizes="150px" />
              {state.taste === t.id && <div className="check taste-check"><Check /></div>}
            </div>
            <div className="choice-title display taste-name">{t.name}</div>
          </button>
        ))}
      </div>
      {picked && (
        <div key={picked.id} className="taste-about">
          <div className="choice-desc">{picked.description}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {picked.points.map((p) => <span key={p} className="point">{p}</span>)}
          </div>
        </div>
      )}
    </>
  );
}
