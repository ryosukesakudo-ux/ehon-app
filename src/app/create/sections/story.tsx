"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "@/components/icons";
import { SampleImage } from "@/components/sample-image";
import { samplePublicUrl, versioned } from "@/lib/samples";
import { seriesImagePath } from "@/lib/series";
import { LEVELS, SHOWN_SERIES_LIST, fixedLevelEpisode, isOpenSeries, isProofread, levelForAge, openEpisodes, parseSeriesKey, seriesKey, type LevelId, type SeriesId } from "@/lib/story-key";
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

/**
 * お話選び（2026-10-14 作道さん）。シリーズとオリジナルのお話を2×2のカードで並べる。
 * シリーズのカードを押すと、ポップアップで話（1〜4話）と文の量を選び、「決定」で決まる（onDecide で次の項目へ）。
 * ポップアップの外か「閉じる」を押すと、何も変えずにカードの一覧に戻る。
 * オリジナルのお話は入力が多いので、ポップアップではなくカードの下に入力欄を開く。
 */
export function StorySection({ ready, onDecide }: { ready: ReadyEpisodes; onDecide?: () => void }) {
  const { state, update } = useFlow();
  const current = parseSeriesKey(state.story);
  const custom = parseCustomKey(state.story);
  const [modal, setModal] = useState<SeriesId | null>(null);
  const [customOpen, setCustomOpen] = useState(!!custom);
  const hasArt = (id: SeriesId, no: number) => !!ready?.[id]?.includes(no);

  function openCustom() {
    // シリーズのお話を選んでいたら外す（オリジナルのお話ができるまで先へ進めないように）
    if (!custom && state.story) update({ story: "", previews: {}, draftId: null });
    setCustomOpen(true);
  }

  return (
    <>
      <div className="story-grid">
        {SHOWN_SERIES_LIST.map((s) => {
          const firstReady = openEpisodes(s.episodes).find((e) => hasArt(s.id, e.no));
          // 公開前のシリーズは「準備中」で、押せない
          const soon = !isOpenSeries(s.id);
          const picked = current?.series === s.id;
          return (
            <button
              key={s.id}
              type="button"
              className="choice story-card"
              aria-pressed={picked}
              aria-haspopup="dialog"
              disabled={soon}
              onClick={() => setModal(s.id)}
            >
              <Thumb src={firstReady ? versioned(samplePublicUrl(seriesImagePath(s.id, firstReady.no, 0))) : null} alt={`${s.name}の見本`} size="100%" />
              <div className="choice-title display story-card-title">{s.name}</div>
              {soon ? <span className="soon">準備中</span> : picked ? <span className="tag">第{current.episode}話を選択中</span> : <span className="tag">全{openEpisodes(s.episodes).length}話</span>}
              {picked && <div className="check story-card-check"><Check /></div>}
            </button>
          );
        })}
        <button type="button" className="choice story-card" aria-pressed={!!custom || customOpen} aria-expanded={customOpen} onClick={openCustom}>
          <div className="story-card-art" style={{ background: "#FDECE8" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </div>
          <div className="choice-title display story-card-title">オリジナルストーリー</div>
          <span className="tag">{custom ? `「${custom.title}」` : "あらすじから作る"}</span>
          {custom && <div className="check story-card-check"><Check /></div>}
        </button>
      </div>
      <p className="section-lead" style={{ margin: 0 }}>シリーズは1冊に1話。季節がめぐるように、続きのお話もあとから作れます。</p>

      {customOpen && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <h2 className="display section-label" style={{ margin: 0 }}>オリジナルストーリー</h2>
            <button type="button" className="ghost" style={{ height: 36, padding: "0 14px", fontSize: 13 }} onClick={() => setCustomOpen(false)}>
              閉じる
            </button>
          </div>
          <p className="section-lead" style={{ margin: 0 }}>あらすじを書くと、AIが12ページのお話にします。ペットやおばあちゃんなども、写真から登場させられます。お話ができると、次へ進めます。</p>
          <CustomStoryPanel open onOpenChange={setCustomOpen} />
        </div>
      )}

      {modal && (
        <EpisodeDialog
          series={modal}
          ready={ready}
          onClose={() => setModal(null)}
          onDecide={(story) => {
            update({ story, previews: {}, draftId: null });
            setModal(null);
            setCustomOpen(false);
            onDecide?.();
          }}
        />
      )}
    </>
  );
}

/** シリーズの話と文の量を選ぶポップアップ。「決定」を押すまでは、選んでいるお話は変えない */
function EpisodeDialog({ series, ready, onClose, onDecide }: { series: SeriesId; ready: ReadyEpisodes; onClose: () => void; onDecide: (story: string) => void }) {
  const { state } = useFlow();
  const s = SHOWN_SERIES_LIST.find((x) => x.id === series)!;
  const current = parseSeriesKey(state.story);
  const hasArt = (no: number) => !!ready?.[series]?.includes(no);
  const isReady = (no: number) => hasArt(no) && isProofread(series, no);
  // 選んでいる話があればそれを、無ければ選べるいちばん最初の話を選んでおく
  const [episode, setEpisode] = useState<number | null>(() =>
    current?.series === series ? current.episode : openEpisodes(s.episodes).find((ep) => isReady(ep.no))?.no ?? null,
  );
  const [level, setLevel] = useState<LevelId>(() =>
    current?.series === series ? current.level : (openEpisodes(s.episodes).find((ep) => ep.no === episode)?.level ?? levelForAge(state.childAge)),
  );
  // 数のお勉強のように、文の量が話ごとに決まっている話（文の量は選ばせず、対象年齢を出す）
  const fixed = episode ? fixedLevelEpisode(series, episode) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // 後ろの画面がスクロールしないように
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // 項目のふわっと出る動き（transform）の中だと画面いっぱいに広がらないので、body の直下に出す
  return createPortal(
    <div className="story-dialog-backdrop" onClick={onClose}>
      <div className="story-dialog" role="dialog" aria-modal="true" aria-labelledby="story-dialog-title" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h2 id="story-dialog-title" className="display" style={{ margin: 0, fontSize: 19, fontWeight: 900, color: "var(--navy)" }}>{s.name}</h2>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--sub)" }}>{s.description}</p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }} role="radiogroup" aria-label="お話">
          {openEpisodes(s.episodes).map((ep) => {
            const ok = isReady(ep.no);
            // 絵はあるが添削待ちの話は、サムネイルを見せて「Coming soon」
            const comingSoon = hasArt(ep.no) && !ok;
            return (
              <button
                key={ep.no}
                type="button"
                role="radio"
                className="choice episode-choice"
                aria-checked={episode === ep.no}
                disabled={!ok}
                onClick={() => {
                  setEpisode(ep.no);
                  if (ep.level) setLevel(ep.level);
                }}
              >
                <Thumb src={ok || comingSoon ? versioned(samplePublicUrl(seriesImagePath(series, ep.no, 0))) : null} alt={`第${ep.no}話の見本`} size={44} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flexGrow: 1 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: "var(--sub)" }}>
                    <span>第{ep.no}話・{ep.season}</span>
                    {ep.ages && <span className="tag">{ep.ages}向け</span>}
                    {!ok && <span className="soon">{comingSoon ? "Coming soon" : ready ? "準備中" : "確認中"}</span>}
                  </div>
                  <div className="display" style={{ fontSize: 15, fontWeight: 800, color: "var(--navy)" }}>{ep.title}</div>
                </div>
                {episode === ep.no && <div className="check"><Check /></div>}
              </button>
            );
          })}
        </div>
        {episode && fixed && (
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>このお話の文は{fixed.ages}向けです（文の量は選べません）。</p>
        )}
        {episode && !fixed && (
          <div className="field">
            <span className="display" style={{ fontWeight: 800, color: "var(--navy)" }}>文の量</span>
            <div className="level-row" role="radiogroup" aria-label="文の量">
              {LEVELS.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={level === l.id} className="choice level-choice" onClick={() => setLevel(l.id)}>
                  <span className="choice-title display">{l.name}</span>
                  <span className="tag">{l.ages}</span>
                  <span className="choice-desc" style={{ fontSize: 12 }}>{l.note}</span>
                </button>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>お話の筋は同じで、多いほど会話や気持ちの言葉がふえます。</p>
          </div>
        )}
        {/* 閉じる（グレー）と決定を下に横並びで固定。スクロールしなくても決定が見える（2026-10-15 作道さん） */}
        <div className="dialog-footer">
          <button type="button" className="ghost gray" style={{ height: 54, padding: "0 16px", flexShrink: 0 }} onClick={onClose}>
            閉じる
          </button>
          <button type="button" className="cta" style={{ height: 54, flex: 1, minWidth: 0 }} disabled={!episode} onClick={() => episode && onDecide(seriesKey(series, episode, fixed?.level ?? level))}>
            決定
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Thumb({ src, alt, size = 72 }: { src: string | null; alt: string; size?: number | "100%" }) {
  return (
    <div style={{ flexShrink: 0, width: size, height: size === "100%" ? undefined : size, aspectRatio: "1 / 1", borderRadius: 12, position: "relative", overflow: "hidden", background: "#E6EEF9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--sub)" }}>
      <SampleImage src={src} alt={alt} fallback="[見本]" sizes={size === "100%" ? "45vw" : `${size}px`} />
    </div>
  );
}
