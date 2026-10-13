"use client";

import { useEffect, useState } from "react";
import { BIRTHDAY_NOTICE_DAYS, CHILD_AGES, REPEAT_COUPON } from "@/lib/catalog";
import { Check, Chevron } from "@/components/icons";
import { SampleImage } from "@/components/sample-image";
import { samplePublicUrl, versioned } from "@/lib/samples";
import { seriesImagePath } from "@/lib/series";
import { LEVELS, OPEN_SERIES, SERIES_LIST, SHOWN_SERIES_LIST, fixedLevelEpisode, isOpenSeries, isProofread, levelForAge, openEpisodes, parseSeriesKey, seriesKey, type SeriesId } from "@/lib/story-key";
import { useFlow } from "../flow";
import { CustomStoryPanel } from "./custom";
import { customStoryComplete, parseCustomKey } from "@/lib/custom-story";
import { BirthdaySelect } from "../birthday-select";
import { NextButton, StepHeader, StepTitle } from "../step";

export default function StoryPage() {
  const { state, update } = useFlow();
  const nameOk = state.childName.trim().length > 0 && state.childName.trim().length <= 12;
  const ageOk = !!state.childAge;
  const current = parseSeriesKey(state.story);
  // 見本の絵がそろって選べるようになった話（シリーズごとの話の番号）
  const [ready, setReady] = useState<Record<SeriesId, number[]> | null>(null);
  // 最初は公開中のシリーズ（森）を開いておく
  const [open, setOpen] = useState<SeriesId | null>(current?.series ?? OPEN_SERIES[0]);
  useEffect(() => {
    const none = Object.fromEntries(SERIES_LIST.map((x) => [x.id, [] as number[]])) as Record<SeriesId, number[]>;
    fetch("/api/series/ready")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setReady(json ?? none))
      .catch(() => setReady(none));
  }, []);
  const hasArt = (id: SeriesId, no: number) => !!ready?.[id]?.includes(no);
  // 選べるのは見本の絵がそろい、添削も終わった話だけ
  const isReady = (id: SeriesId, no: number) => hasArt(id, no) && isProofread(id, no);
  const custom = parseCustomKey(state.story);
  const storyOk = custom ? customStoryComplete(custom) : !!current && isReady(current.series, current.episode);
  const choose = (story: string) => update({ story, previews: {}, draftId: null });
  // 数のお勉強のように、文の量が話ごとに決まっている話（文の量は選ばせず、対象年齢を出す）
  const fixed = current ? fixedLevelEpisode(current.series, current.episode) : null;

  return (
    <>
      <StepHeader step={2} back="/create/taste" />
      <main className="step-body">
        <StepTitle title="お話を選んでください" lead="主人公はお子さまです。名前は本文に入ります。" />

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
        <div className="field">
          <label htmlFor="childage" className="display">主人公の年齢</label>
          <select
            id="childage"
            value={state.childAge ?? ""}
            onChange={(e) => update({ childAge: e.target.value ? Number(e.target.value) : null, previews: {}, draftId: null })}
          >
            <option value="">選んでください</option>
            {CHILD_AGES.map((a) => (
              <option key={a} value={a}>{a}さい</option>
            ))}
          </select>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>絵の中の背丈や体つきを、年齢に合わせて描きます。</p>
        </div>
        <div className="field">
          <label htmlFor="childbirthday" className="display">お誕生日（任意）</label>
          <BirthdaySelect id="childbirthday" value={state.childBirthday} onChange={(v) => update({ childBirthday: v })} />
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
            入れておくと、毎年お誕生日の{BIRTHDAY_NOTICE_DAYS === 30 ? "1か月" : `${BIRTHDAY_NOTICE_DAYS}日`}前に、続編の絵本のご案内（{REPEAT_COUPON.discount}円引きのクーポン付き）をメールでお送りします。
          </p>
        </div>
      </main>
      <NextButton href="/create/photo" disabled={!nameOk || !ageOk || !storyOk}>次へ：写真をえらぶ</NextButton>
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
