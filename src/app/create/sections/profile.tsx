"use client";

import { BIRTHDAY_NOTICE_DAYS, CHILD_AGES, REPEAT_COUPON } from "@/lib/catalog";
import { useFlow } from "../flow";
import { BirthdaySelect } from "../birthday-select";

export function profileOk(name: string, age: number | null) {
  const n = name.trim().length;
  return n > 0 && n <= 12 && !!age;
}

/** 主人公の名前・年齢・お誕生日（オリジナルのお話を作るときにも使うので、お話より先に聞く。名前と年齢が入ると、お話の項目が出る） */
export function ProfileSection() {
  const { state, update } = useFlow();
  return (
    <>
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
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>絵の中の背丈や体つきと、文の量を年齢に合わせます。</p>
      </div>
      <div className="field">
        <label htmlFor="childbirthday" className="display">お誕生日（任意）</label>
        <BirthdaySelect id="childbirthday" value={state.childBirthday} onChange={(v) => update({ childBirthday: v })} />
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
          入れておくと、毎年お誕生日の{BIRTHDAY_NOTICE_DAYS === 30 ? "1か月" : `${BIRTHDAY_NOTICE_DAYS}日`}前に、続編の絵本のご案内（{REPEAT_COUPON.discount}円引きのクーポン付き）をメールでお送りします。
        </p>
      </div>
    </>
  );
}
