"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { getTaste } from "@/lib/catalog";
import { SERIES_LIST, levelLabel, storyLabel, type SeriesId } from "@/lib/story-key";
import { useFlow } from "./flow";
import { StepHeader, StepTitle } from "./step";
import { TasteSection } from "./sections/taste";
import { ProfileSection, profileOk } from "./sections/profile";
import { StorySection, storyChosen, type ReadyEpisodes } from "./sections/story";
import { PhotoSection } from "./sections/photo";

// 作成の最初の部分（タッチ→主人公→お話→写真）を1ページで、下へ下へと進める（2026-10-13 作道さん、TaleCoco を参考に）。
// 済んだ項目は1行にたたみ（「変更」で開き直せる）、次の項目がその下に出てくる。写真を送ると見本のページへ移る。

export type SectionId = "taste" | "profile" | "story" | "photo";
const ORDER: SectionId[] = ["taste", "profile", "story", "photo"];

const SECTIONS: Record<SectionId, { label: string; title: string; lead: string; step: number; path: string }> = {
  taste: { label: "絵のタッチ", title: "絵のテイストを選んでください", lead: "絵本全体のタッチになります。", step: 1, path: "/create/taste" },
  profile: { label: "主人公", title: "主人公のことを教えてください", lead: "名前は本文に入ります。", step: 2, path: "/create/story" },
  story: { label: "お話", title: "お話を選んでください", lead: "主人公はお子さまです。", step: 2, path: "/create/story" },
  photo: { label: "写真", title: "登場人物の写真をえらんでください", lead: "正面を向いた、明るい写真がおすすめです。", step: 3, path: "/create/photo" },
};

export function OnePageFlow({ start }: { start: SectionId }) {
  const { state, update, ready: flowReady } = useFlow();
  const [open, setOpen] = useState<SectionId>(start);
  // いちばん先まで進んだ項目（ここまでは、たたんだ行で見える）
  const [reached, setReached] = useState(ORDER.indexOf(start));
  const [ready, setReady] = useState<ReadyEpisodes>(null);
  const refs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});
  // 押して進んだときだけスクロールする（開いた直後は動かさない）
  const moved = useRef(false);

  useEffect(() => {
    const none = Object.fromEntries(SERIES_LIST.map((x) => [x.id, [] as number[]])) as Record<SeriesId, number[]>;
    fetch("/api/series/ready")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setReady(json ?? none))
      .catch(() => setReady(none));
  }, []);

  const valid: Record<SectionId, boolean> = {
    taste: true,
    profile: profileOk(state.childName, state.childAge),
    story: storyChosen(state.story, ready),
    photo: false,
  };

  // 途中の項目から開いたのに主人公が未入力なら（別の端末で始めたときなど）、そこから
  useEffect(() => {
    if (!flowReady) return;
    if (ORDER.indexOf(start) > ORDER.indexOf("profile") && !profileOk(state.childName, state.childAge)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 読み込んだ入力内容に合わせて、開く項目を決め直す
      setOpen("profile");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 入力内容を読み込んだときに一度だけ
  }, [flowReady]);

  // 開いている項目を覚えておく（ログイン後やマイページの「つづきから」で、この項目に戻れるように）
  useEffect(() => {
    if (flowReady) update({ path: SECTIONS[open].path });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 開く項目が変わったときだけ記録する
  }, [flowReady, open]);

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    const el = refs.current[open];
    // 前の項目がたたまれてから動かす
    const t = window.setTimeout(() => el?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    return () => window.clearTimeout(t);
  }, [open]);

  /** 項目を終えたら、次のまだ済んでいない項目へ（開き直して直したときは、進んでいたところまで戻る） */
  function next(from: SectionId) {
    const i = ORDER.indexOf(from);
    const target = Math.max(i + 1, reached);
    const todo = ORDER.slice(i + 1, target).find((id) => !valid[id]) ?? ORDER[target];
    moved.current = true;
    setReached((r) => Math.max(r, ORDER.indexOf(todo)));
    setOpen(todo);
  }

  function edit(id: SectionId) {
    moved.current = true;
    setOpen(id);
  }

  const summary: Record<SectionId, string> = {
    taste: getTaste(state.taste)?.name ?? "",
    profile: state.childAge ? `${state.childName.trim()}・${state.childAge}さい` : state.childName.trim(),
    story: [storyLabel(state.story), levelLabel(state.story)].filter(Boolean).join("・"),
    photo: "",
  };

  const body: Record<SectionId, ReactNode> = {
    taste: <TasteSection onPicked={() => next("taste")} />,
    profile: <ProfileSection onNext={() => next("profile")} />,
    story: <StorySection ready={ready} onPicked={() => next("story")} />,
    photo: <PhotoSection />,
  };

  return (
    <>
      <StepHeader step={SECTIONS[open].step} trackPath={false} sticky />
      <main className="step-body flow-page" data-last={open === "photo" ? "" : undefined}>
        {ORDER.map((id, i) => {
          const s = SECTIONS[id];
          if (id === open) {
            return (
              <section key={id} ref={(el) => { refs.current[id] = el; }} className="flow-section" aria-label={s.label}>
                <StepTitle title={s.title} lead={s.lead} />
                {body[id]}
              </section>
            );
          }
          if (i <= reached) {
            return (
              <section key={id} ref={(el) => { refs.current[id] = el; }} aria-label={s.label}>
                <button type="button" className="flow-done" onClick={() => edit(id)}>
                  <span className="flow-done-mark" aria-hidden="true">{valid[id] ? "✓" : i + 1}</span>
                  <span className="flow-done-text">
                    <span className="flow-done-label">{s.label}</span>
                    <span className="flow-done-value display">{valid[id] ? summary[id] : "まだ選んでいません"}</span>
                  </span>
                  <span className="flow-done-edit display">変更</span>
                </button>
              </section>
            );
          }
          // まだ先の項目は、うすく見せておく（このあと何があるか分かるように）
          return (
            <div key={id} className="flow-later" aria-hidden="true">
              <span className="flow-done-mark">{i + 1}</span>
              <span className="display">{s.label}</span>
            </div>
          );
        })}
      </main>
    </>
  );
}
