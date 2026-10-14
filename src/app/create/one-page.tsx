"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SERIES_LIST, type SeriesId } from "@/lib/story-key";
import { useFlow } from "./flow";
import { StepHeader, StepTitle } from "./step";
import { TasteSection } from "./sections/taste";
import { ProfileSection, profileOk } from "./sections/profile";
import { StorySection, storyChosen, type ReadyEpisodes } from "./sections/story";
import { PhotoSection } from "./sections/photo";

// 作成の最初の部分（タッチ→主人公→お話→写真）を1ページで、下へ下へと進める（2026-10-13 作道さん、TaleCoco を参考に）。
// 選んだ項目は開いたまま（その場で選び直せる）。前の項目が済むと、次の項目が下に出てくる（自動ではスクロールしない）。
// 写真を送ると見本のページへ移る。

export type SectionId = "taste" | "profile" | "story" | "photo";
const ORDER: SectionId[] = ["taste", "profile", "story", "photo"];

const SECTIONS: Record<SectionId, { title: string; lead: string; step: number; path: string }> = {
  taste: { title: "絵のテイストを選んでください", lead: "絵本全体のタッチになります。", step: 1, path: "/create/taste" },
  profile: { title: "主人公のことを教えてください", lead: "名前は本文に入ります。", step: 2, path: "/create/story" },
  story: { title: "お話を選んでください", lead: "主人公はお子さまです。", step: 2, path: "/create/story" },
  photo: { title: "登場人物の写真をえらんでください", lead: "正面を向いた、明るい写真がおすすめです。", step: 3, path: "/create/photo" },
};

export function OnePageFlow({ start }: { start: SectionId }) {
  const { state, update, ready: flowReady } = useFlow();
  const [ready, setReady] = useState<ReadyEpisodes>(null);
  // 画面のいちばん上に見えている項目（ヘッダーの丸をこれに合わせる）
  const [inView, setInView] = useState<SectionId>("taste");
  const refs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});

  useEffect(() => {
    const none = Object.fromEntries(SERIES_LIST.map((x) => [x.id, [] as number[]])) as Record<SeriesId, number[]>;
    fetch("/api/series/ready")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setReady(json ?? none))
      .catch(() => setReady(none));
  }, []);

  // 前の項目が済んでいれば、次の項目を出す（タッチは最初から水彩を選んであるので、主人公までは最初から見える）
  const profileDone = profileOk(state.childName, state.childAge, state.childHonorific);
  const storyDone = profileDone && storyChosen(state.story, ready);
  const shown: SectionId[] = ["taste", "profile", ...(profileDone ? (["story"] as const) : []), ...(storyDone ? (["photo"] as const) : [])];
  const last = shown[shown.length - 1];

  // いちばん先の項目を覚えておく（ログイン後やマイページの「つづきから」で、ここまで戻れるように）
  useEffect(() => {
    if (flowReady) update({ path: SECTIONS[last].path });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 出ている項目が変わったときだけ記録する
  }, [flowReady, last]);

  // 途中の項目の URL から開いたとき（ログイン後・見本ページの「戻る」）は、その項目まで一度だけ動かす
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || start === "taste" || !flowReady || (start === "photo" && ready === null)) return;
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
      setInView(current ?? "taste");
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
    taste: <TasteSection />,
    profile: <ProfileSection />,
    story: <StorySection ready={ready} />,
    photo: <PhotoSection />,
  };

  return (
    <>
      <StepHeader step={SECTIONS[inView].step} trackPath={false} sticky />
      <main className="step-body flow-page" data-last={last === "photo" ? "" : undefined}>
        {shown.map((id) => (
          <section key={id} ref={(el) => { refs.current[id] = el; }} className="flow-section">
            <StepTitle title={SECTIONS[id].title} lead={SECTIONS[id].lead} />
            {body[id]}
          </section>
        ))}
        {last !== "photo" && (
          <p className="flow-hint">{last === "profile" ? "名前と年齢を入れると、お話を選べます" : "お話を選ぶと、写真をえらべます"}</p>
        )}
      </main>
    </>
  );
}
