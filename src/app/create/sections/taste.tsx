"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { STORIES, TASTES, type StoryId, type TasteId } from "@/lib/catalog";
import { parseSeriesKey } from "@/lib/story-key";
import { Check } from "@/components/icons";
import { SampleImage } from "@/components/sample-image";
import { SAMPLE_SCENES, sampleUrl } from "@/lib/samples";
import { useFlow } from "../flow";

/** 絵のテイスト。小さめのカードを横に3つ並べ、選んでいるタッチの説明を下に出す */
/** onPick：テイストを押したとき（選んでいるものを押し直したときも）。1ページの作成画面で次の項目を出す */
/** カードをタップすると選ばれて、大きな見本がポップアップで出る（2026-10-19 小さくてタッチが分かりづらいという声） */
export function TasteSection({ onPick }: { onPick?: () => void } = {}) {
  const { state, update } = useFlow();
  const [zoom, setZoom] = useState<TasteId | null>(null);
  // テイストごとの見本は旧版の3つのお話にある。シリーズを選んでいるときは同じ名前のお話（無ければ森）の見本を出す
  const id = parseSeriesKey(state.story)?.series ?? state.story;
  const sampleStory: StoryId = STORIES.find((s) => s.id === id)?.id ?? "forest";
  const picked = TASTES.find((t) => t.id === state.taste);
  const close = () => {
    setZoom(null);
    onPick?.();
  };
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
            onClick={() => {
              if (state.taste !== t.id) update({ taste: t.id, previews: {}, draftId: null });
              setZoom(t.id);
            }}
          >
            <div className="taste-art" style={{ background: t.swatch }}>
              <SampleImage src={sampleUrl(t.id, sampleStory, 0)} alt={`${t.name}の見本`} fallback="[見本]" sizes="150px" />
              {state.taste === t.id && <div className="check taste-check"><Check /></div>}
              {t.recommended && <span className="taste-reco">オススメ</span>}
            </div>
            <div className="choice-title display taste-name">{t.name}</div>
          </button>
        ))}
      </div>
      <p className="taste-hint">タップすると大きな見本が見られます</p>
      {picked && (
        <div key={picked.id} className="taste-about">
          <div className="choice-desc">{picked.description}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {picked.points.map((p) => <span key={p} className="point">{p}</span>)}
          </div>
        </div>
      )}
      {zoom && <TasteZoom taste={zoom} story={sampleStory} onClose={close} />}
    </>
  );
}

/** テイストの大きな見本（3場面を切り替えて見られる） */
function TasteZoom({ taste, story, onClose }: { taste: TasteId; story: StoryId; onClose: () => void }) {
  const t = TASTES.find((x) => x.id === taste)!;
  const [shown, setShown] = useState(SAMPLE_SCENES[0]);
  // 項目のふわっと出る動き（transform）の中だと画面いっぱいに広がらないので、body の直下に出す
  return createPortal(
    <div className="story-dialog-backdrop" onClick={onClose}>
      <div className="story-dialog" role="dialog" aria-modal="true" aria-labelledby="taste-dialog-title" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 id="taste-dialog-title" className="display" style={{ margin: 0, fontSize: 19, fontWeight: 900, color: "var(--navy)", display: "flex", alignItems: "center", gap: 8 }}>
            {t.name}
            {t.recommended && <span className="tag">オススメ</span>}
          </h2>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--sub)" }}>{t.description}</p>
        </div>
        <div className="taste-zoom-art" style={{ background: t.swatch }}>
          <SampleImage src={sampleUrl(taste, story, shown)} alt={`${t.name}の見本`} fallback="[見本]" sizes="(max-width: 560px) 100vw, 520px" />
        </div>
        <div className="taste-zoom-thumbs" role="tablist" aria-label="見本の場面">
          {SAMPLE_SCENES.map((n, i) => (
            <button key={n} type="button" role="tab" aria-selected={shown === n} aria-label={`見本${i + 1}`} className="taste-zoom-thumb" style={{ background: t.swatch }} onClick={() => setShown(n)}>
              <SampleImage src={sampleUrl(taste, story, n)} alt="" fallback="" sizes="96px" />
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {t.points.map((p) => <span key={p} className="point">{p}</span>)}
        </div>
        <div className="dialog-footer">
          <button type="button" className="cta" style={{ height: 54, flex: 1, minWidth: 0 }} onClick={onClose}>
            {t.name}にする
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
