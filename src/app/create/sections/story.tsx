"use client";

import { useState } from "react";
import { Check, Chevron } from "@/components/icons";
import { SampleImage } from "@/components/sample-image";
import { samplePublicUrl, versioned } from "@/lib/samples";
import { seriesImagePath } from "@/lib/series";
import { LEVELS, OPEN_SERIES, SHOWN_SERIES_LIST, fixedLevelEpisode, isOpenSeries, isProofread, levelForAge, openEpisodes, parseSeriesKey, seriesKey, type SeriesId } from "@/lib/story-key";
import { customStoryComplete, parseCustomKey } from "@/lib/custom-story";
import { useFlow } from "../flow";
import { CustomStoryPanel } from "./custom-story";

/** 見本の絵がそろって選べるようになった話（シリーズごとの話の番号）。null は確認中 */
export type ReadyEpisodes = Record<SeriesId, number[]> | null;

/** 選べるのは見本の絵がそろい、添削も終わった話だけ */
export function storyChosen(story: string, ready: ReadyEpisodes) {
  const custom = parseCustomKey(story);
  if (custom) return customStoryComplete(custom);
  const k = parseSeriesKey(story);
  return !!k && !!ready?.[k.series]?.includes(k.episode) && isProofread(k.series, k.episode);
}

/** お話選び。話を選ぶと、すぐ下に文の量が出る（選び終わると、写真の項目が下に出る） */
export function StorySection({ ready }: { ready: ReadyEpisodes }) {
  const { state, update } = useFlow();
  const current = parseSeriesKey(state.story);
  // 最初は公開中のシリーズ（森）を開いておく
  const [open, setOpen] = useState<SeriesId | null>(current?.series ?? OPEN_SERIES[0]);
  const hasArt = (id: SeriesId, no: number) => !!ready?.[id]?.includes(no);
  const isReady = (id: SeriesId, no: number) => hasArt(id, no) && isProofread(id, no);
  const choose = (story: string) => update({ story, previews: {}, draftId: null });
  // 数のお勉強のように、文の量が話ごとに決まっている話（文の量は選ばせず、対象年齢を出す）
  const fixed = current ? fixedLevelEpisode(current.series, current.episode) : null;

  return (
    <>
      <h2 className="display section-label">シリーズのお話</h2>
      <p className="section-lead">1冊に1話。季節がめぐるように、続きのお話もあとから作れます。</p>
      {SHOWN_SERIES_LIST.map((s) => {
        const firstReady = openEpisodes(s.episodes).find((e) => hasArt(s.id, e.no));
        // 公開前のシリーズは「準備中」で、開けない
        const soon = !isOpenSeries(s.id);
        const expanded = !soon && open === s.id;
        return (
          <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              type="button"
              className="choice"
              aria-expanded={expanded}
              aria-pressed={current?.series === s.id}
              disabled={soon}
              onClick={() => setOpen(expanded ? null : s.id)}
            >
              <Thumb src={firstReady ? versioned(samplePublicUrl(seriesImagePath(s.id, firstReady.no, 0))) : null} alt={`${s.name}の見本`} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexGrow: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <div className="choice-title display">{s.name}</div>
                  {soon ? <span className="soon">準備中</span> : <div className="tag">全{openEpisodes(s.episodes).length}話</div>}
                </div>
                <div className="choice-desc">{s.description}</div>
              </div>
              {!soon && <Chevron dir={expanded ? "up" : "down"} size={18} />}
            </button>
            {expanded && (
              <div className="episode-list">
                {openEpisodes(s.episodes).map((ep) => {
                  const ok = isReady(s.id, ep.no);
                  // 絵はあるが添削待ちの話は、サムネイルを見せて「Coming soon」
                  const comingSoon = hasArt(s.id, ep.no) && !ok;
                  const selected = current?.series === s.id && current.episode === ep.no;
                  return (
                    <button
                      key={ep.no}
                      type="button"
                      className="choice episode-choice"
                      aria-pressed={selected}
                      disabled={!ok}
                      onClick={() => choose(seriesKey(s.id, ep.no, ep.level ?? (current && !fixed ? current.level : levelForAge(state.childAge))))}
                    >
                      <Thumb src={ok || comingSoon ? versioned(samplePublicUrl(seriesImagePath(s.id, ep.no, 0))) : null} alt={`第${ep.no}話の見本`} size={56} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexGrow: 1 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: "var(--sub)" }}>
                          <span>第{ep.no}話・{ep.season}</span>
                          {ep.ages && <span className="tag">{ep.ages}向け</span>}
                          {!ok && <span className="soon">{comingSoon ? "Coming soon" : ready ? "準備中" : "確認中"}</span>}
                        </div>
                        <div className="display" style={{ fontSize: 15, fontWeight: 800, color: "var(--navy)" }}>{ep.title}</div>
                      </div>
                      {selected && <div className="check"><Check /></div>}
                    </button>
                  );
                })}
              </div>
            )}
            {current?.series === s.id && fixed && (
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
                このお話の文は{fixed.ages}向けです（文の量は選べません）。
              </p>
            )}
            {current?.series === s.id && !fixed && (
              <div className="field">
                <span className="display" style={{ fontWeight: 800, color: "var(--navy)" }}>文の量</span>
                <div className="level-row" role="radiogroup" aria-label="文の量">
                  {LEVELS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      role="radio"
                      aria-checked={current.level === l.id}
                      className="choice level-choice"
                      onClick={() => choose(seriesKey(current.series, current.episode, l.id))}
                    >
                      <span className="choice-title display">{l.name}</span>
                      <span className="tag">{l.ages}</span>
                      <span className="choice-desc" style={{ fontSize: 12 }}>{l.note}</span>
                    </button>
                  ))}
                </div>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>お話の筋は同じで、多いほど会話や気持ちの言葉がふえます。</p>
              </div>
            )}
          </div>
        );
      })}

      <h2 className="display section-label">自分で考えるお話</h2>
      <p className="section-lead">お子さまの好きなものや、家族の思い出をお話にできます。</p>
      <CustomStoryPanel />

    </>
  );
}

function Thumb({ src, alt, size = 72 }: { src: string | null; alt: string; size?: number }) {
  return (
    <div style={{ flexShrink: 0, width: size, height: size, borderRadius: 12, overflow: "hidden", background: "#E6EEF9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--sub)" }}>
      <SampleImage src={src} alt={alt} fallback="[見本]" sizes={`${size}px`} />
    </div>
  );
}
