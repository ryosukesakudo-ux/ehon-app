"use client";

import { BIRTHDAY_NOTICE_DAYS, CHILD_AGES, REPEAT_COUPON, STORIES, jstDate } from "@/lib/catalog";
import { Check } from "@/components/icons";
import { SampleImage } from "@/components/sample-image";
import { sampleUrl } from "@/lib/samples";
import { useFlow } from "../flow";
import { NextButton, StepHeader, StepTitle } from "../step";

export default function StoryPage() {
  const { state, update } = useFlow();
  const nameOk = state.childName.trim().length > 0 && state.childName.trim().length <= 12;
  const ageOk = !!state.childAge;
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
            <div style={{ flexShrink: 0, width: 72, height: 72, borderRadius: 12, overflow: "hidden", background: "#E6EEF9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--sub)" }}>
              <SampleImage src={sampleUrl(state.taste, s.id, 0)} alt={`${s.name}の見本`} fallback="[見本]" sizes="72px" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flexGrow: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
          <input
            id="childbirthday"
            type="date"
            max={jstDate(0)}
            value={state.childBirthday}
            onChange={(e) => update({ childBirthday: e.target.value })}
          />
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
            入れておくと、毎年お誕生日の{BIRTHDAY_NOTICE_DAYS === 30 ? "1か月" : `${BIRTHDAY_NOTICE_DAYS}日`}前に、続編の絵本のご案内（{REPEAT_COUPON.discount}円引きのクーポン付き）をメールでお送りします。
          </p>
        </div>
      </main>
      <NextButton href="/create/photo" disabled={!nameOk || !ageOk}>次へ：写真をえらぶ</NextButton>
    </>
  );
}
