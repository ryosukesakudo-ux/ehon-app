"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SERIES_LIST, getSeriesInfo, needsOutfit, parseSeriesKey, type SeriesId } from "@/lib/story-key";
import { useFlow } from "./flow";
import { StepHeader, StepTitle } from "./step";
import { TasteSection } from "./sections/taste";
import { ProfileSection, profileOk } from "./sections/profile";
import { StorySection, storyChosen, type ReadyEpisodes } from "./sections/story";
import { PhotoSection } from "./sections/photo";
import { OutfitSection } from "./sections/outfit";

// 作成の最初の部分（主人公→お話→タッチ→写真）を1ページで、下へ下へと進める（2026-10-13 作道さん、TaleCoco を参考に）。
// 2026-10-14 作道さん：最初はタッチだけを出し、タッチを押す・主人公の「次へ」・お話の「決定」で次の項目を下に出して、
// そこへゆっくりスクロールする。選んだ項目は開いたまま上に残す（その場で選び直せる）。上の段階の丸を押すとその項目へ戻り、
// 選び直すと、いちばん下の項目（まだ選んでいない項目）へ戻る。写真を送ると見本のページへ移る。
// 2026-10-24 作道さん：お話を先に選び、タッチはそのあと。タッチが決まっているお話（ヒーロー・プリンセス）はタッチの項目を出さない。

// 服を選ぶお話（ヒーロー・プリンセス）は、お話と写真のあいだに服選び（outfit）が入る（2026-10-23 作道さん）
export type SectionId = "taste" | "profile" | "story" | "outfit" | "photo";
const ORDER: SectionId[] = ["profile", "story", "outfit", "taste", "photo"];

// /create/taste はこのページのはじめ（主人公の項目）。タッチの項目は、お話の画面（/create/story）として覚える
const SECTIONS: Record<SectionId, { title: string; lead: string; step: number; path: string }> = {
  profile: { title: "主人公のことを教えてください", lead: "名前は本文に入ります。", step: 1, path: "/create/taste" },
  story: { title: "お話を選んでください", lead: "主人公はお子さまです。", step: 1, path: "/create/story" },
  outfit: { title: "服をえらんでください", lead: "形を選ぶと、色が選べます。", step: 1, path: "/create/story" },
  taste: { title: "絵のテイストを選んでください", lead: "絵本全体のタッチになります。", step: 2, path: "/create/story" },
  photo: { title: "登場人物の写真をえらんでください", lead: "正面を向いた、明るい写真がおすすめです。", step: 3, path: "/create/photo" },
};

export function OnePageFlow({ start }: { start: SectionId }) {
  const { state, update, ready: flowReady } = useFlow();
  const [ready, setReady] = useState<ReadyEpisodes>(null);
  // 画面のいちばん上に見えている項目（ヘッダーの丸をこれに合わせる）
  const [inView, setInView] = useState<SectionId>("profile");
  const refs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});

  useEffect(() => {
    const none = Object.fromEntries(SERIES_LIST.map((x) => [x.id, [] as number[]])) as Record<SeriesId, number[]>;
    fetch("/api/series/ready")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setReady(json?.art && json?.published ? json : { art: none, published: none }))
      .catch(() => setReady({ art: none, published: none }));
  }, []);

  // どこまで出したか（選ぶ・「次へ」で1つずつ進む）。途中の項目のURLから開いたときは、そこまで出す
  const reachedAt = Math.max(ORDER.indexOf(state.reached as SectionId), ORDER.indexOf(start));
  const profileDone = profileOk(state.childName, state.childAge, state.childHonorific);
  const storyDone = profileDone && storyChosen(state.story, ready);
  const seriesInfo = getSeriesInfo(parseSeriesKey(state.story)?.series ?? "");
  const outfitLabel = seriesInfo?.outfitLabel;
  // タッチが決まっているお話は、タッチを選ばない
  const fixedTaste = !!seriesInfo?.styleName;
  const outfitDone = storyDone && !needsOutfit(state.story);
  // 前の項目が済んでいて、そこまで進んだ項目だけを出す（服選びは服を選ぶお話のときだけ、タッチはタッチが決まっていないお話のときだけ）
  const shown: SectionId[] = [
    "profile",
    ...(reachedAt >= 1 && profileDone ? (["story"] as const) : []),
    ...(reachedAt >= 2 && storyDone && outfitLabel ? (["outfit"] as const) : []),
    ...(reachedAt >= 3 && outfitDone && !fixedTaste ? (["taste"] as const) : []),
    ...(reachedAt >= 4 && outfitDone ? (["photo"] as const) : []),
  ];
  const last = shown[shown.length - 1];

  // 次の項目を出して、いちばん下の項目へゆっくりスクロールする（選び直したときも、いちばん下の項目へ戻る）
  const scrollToLast = useRef(false);
  const advance = (from: SectionId) => {
    // 出さない項目（服を選ばないお話の服選び、タッチが決まっているお話のタッチ）は飛ばす
    const skip = (id: SectionId) => (id === "outfit" && !outfitLabel) || (id === "taste" && fixedTaste);
    let i = ORDER.indexOf(from) + 1;
    while (ORDER[i] && skip(ORDER[i])) i++;
    const next = ORDER[i];
    if (next && ORDER.indexOf(next) > ORDER.indexOf(state.reached as SectionId)) update({ reached: next });
    scrollToLast.current = true;
  };
  useEffect(() => {
    if (!scrollToLast.current) return;
    scrollToLast.current = false;
    refs.current[last]?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // オリジナルのお話は、できあがったら次の項目（写真）へ進む
  const customDone = storyDone && state.story.startsWith("custom:");
  const wasCustomDone = useRef(customDone);
  useEffect(() => {
    if (customDone && !wasCustomDone.current) advance("story");
    wasCustomDone.current = customDone;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- できあがったときだけ進める
  }, [customDone]);

  // 上の段階の丸を押したら、その項目へ戻る（1 主人公とお話、2 タッチ、3 写真）。タッチを出していないお話は、2 でお話（服選び）へ戻る
  const jump = (step: number) => {
    const target: SectionId =
      step === 1 ? "profile" : step === 2 ? (shown.includes("taste") ? "taste" : outfitLabel ? "outfit" : "story") : "photo";
    refs.current[target]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // いちばん先の項目を覚えておく（ログイン後やマイページの「つづきから」で、ここまで戻れるように）
  useEffect(() => {
    if (flowReady) update({ path: SECTIONS[last].path });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 出ている項目が変わったときだけ記録する
  }, [flowReady, last]);

  // 途中の項目の URL から開いたとき（ログイン後・見本ページの「戻る」）は、その項目まで一度だけ動かす
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || start === "profile" || !flowReady || (start === "photo" && ready === null)) return;
    const target = shown.includes(start) ? start : last;
    jumped.current = true;
    refs.current[target]?.scrollIntoView({ block: "start" });
  });

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      // 見出しがヘッダーのすぐ下より上に来ている項目のうち、いちばん下のもの
      const current = [...ORDER].reverse().find((id) => {
        const el = refs.current[id];
        return !!el && el.getBoundingClientRect().top <= 180;
      });
      setInView(current ?? "profile");
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const body: Record<SectionId, ReactNode> = {
    taste: <TasteSection onPick={() => advance("taste")} />,
    profile: (
      <>
        <ProfileSection />
        <button type="button" className="cta" disabled={!profileDone} onClick={() => advance("profile")}>
          次へ
        </button>
      </>
    ),
    story: <StorySection ready={ready} onDecide={() => advance("story")} />,
    outfit: <OutfitSection onDecide={() => advance("outfit")} />,
    photo: <PhotoSection />,
  };

  return (
    <>
      <StepHeader step={SECTIONS[inView].step} trackPath={false} sticky onStep={jump} reachable={SECTIONS[last].step} />
      <main className="step-body flow-page" data-last={last === "photo" ? "" : undefined}>
        {shown.map((id) => (
          <section key={id} ref={(el) => { refs.current[id] = el; }} className="flow-section">
            <StepTitle title={SECTIONS[id].title} lead={SECTIONS[id].lead} />
            {body[id]}
          </section>
        ))}
        {last !== "photo" && (
          <p className="flow-hint">
            {last === "profile"
              ? "名前・呼び方・年齢を入れて「次へ」を押すと、お話を選べます"
              : last === "taste"
                ? "タッチを押すと、写真をえらべます"
                : last === "outfit"
                  ? `${outfitLabel ?? "服"}を選ぶと、${fixedTaste ? "写真をえらべます" : "絵のタッチを選べます"}`
                  : fixedTaste
                    ? "お話を決めると、写真をえらべます"
                    : "お話を決めると、絵のタッチを選べます"}
          </p>
        )}
      </main>
    </>
  );
}
