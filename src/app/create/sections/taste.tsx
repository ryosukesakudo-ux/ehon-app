"use client";

import { STORIES, TASTES, type StoryId } from "@/lib/catalog";
import { parseSeriesKey } from "@/lib/story-key";
import { Check } from "@/components/icons";
import { SampleImage } from "@/components/sample-image";
import { sampleUrl } from "@/lib/samples";
import { useFlow } from "../flow";

/** 絵のテイスト。選んだら（選んでいるものを押し直しても）次の項目へ進む */
export function TasteSection({ onPicked }: { onPicked: () => void }) {
  const { state, update } = useFlow();
  // テイストごとの見本は旧版の3つのお話にある。シリーズを選んでいるときは同じ名前のお話（無ければ森）の見本を出す
  const id = parseSeriesKey(state.story)?.series ?? state.story;
  const sampleStory: StoryId = STORIES.find((s) => s.id === id)?.id ?? "forest";
  return (
    <>
      {TASTES.map((t) => (
        <button
          key={t.id}
          type="button"
          className="choice taste-choice"
          aria-pressed={state.taste === t.id}
          onClick={() => {
            if (state.taste !== t.id) update({ taste: t.id, previews: {}, draftId: null });
            onPicked();
          }}
        >
          {/* タッチの違いが分かるよう、絵を大きく見せる */}
          <div className="taste-art" style={{ background: t.swatch }}>
            <SampleImage src={sampleUrl(t.id, sampleStory, 0)} alt={`${t.name}の見本`} fallback="[見本画像]" sizes="(max-width: 480px) 100vw, 440px" />
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
    </>
  );
}
