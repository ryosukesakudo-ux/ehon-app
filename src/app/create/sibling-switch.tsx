"use client";

import { SIBLING_RELATIONS, type SiblingRelation } from "@/lib/catalog";

export type SiblingInput = { name: string; age: number | null; relation: SiblingRelation | "" };

/** 入力がそろっているか（名前・年齢・続柄） */
export function siblingComplete(s: SiblingInput | undefined) {
  return !!s && !!s.name.trim() && s.age !== null && !!s.relation;
}

const AGES = Array.from({ length: 19 }, (_, i) => i);

/**
 * ママ・パパの欄に、兄弟姉妹を入れるかどうか（2026-10-19 作道さん）。
 * 兄弟姉妹にすると、本文の「ママ」「パパ」はその子の呼び方になり、絵ではその年齢の子どもとして描く
 */
export function SiblingSwitch({ parent, value, onChange }: { parent: "ママ" | "パパ"; value: SiblingInput | null; onChange: (v: SiblingInput | null) => void }) {
  const on = !!value;
  const pill = (active: boolean) => ({
    flex: 1,
    height: 38,
    borderRadius: 19,
    fontSize: 14,
    cursor: "pointer",
    border: active ? "2px solid var(--coral)" : "1px solid var(--line)",
    background: active ? "#FDECE8" : "#fff",
    color: "var(--navy)",
    fontWeight: active ? 800 : 500,
  });
  const field = { height: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 16, background: "#fff" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div role="radiogroup" aria-label={`${parent}の欄に入れる人`} style={{ display: "flex", gap: 6 }}>
        <button type="button" role="radio" aria-checked={!on} style={pill(!on)} onClick={() => onChange(null)}>
          {parent}
        </button>
        <button type="button" role="radio" aria-checked={on} style={pill(on)} onClick={() => !on && onChange({ name: "", age: null, relation: "" })}>
          兄弟姉妹を入れる
        </button>
      </div>
      {value && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--sub)" }}>
            本の中での呼び方（例：ゆずき／おねえちゃん）
            <input type="text" value={value.name} maxLength={10} onChange={(e) => onChange({ ...value, name: e.target.value })} style={field} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--sub)", flex: 1 }}>
              年齢
              <select value={value.age ?? ""} onChange={(e) => onChange({ ...value, age: e.target.value === "" ? null : Number(e.target.value) })} style={field}>
                <option value="">えらぶ</option>
                {AGES.map((a) => (
                  <option key={a} value={a}>{a}歳</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--sub)", flex: 1 }}>
              主人公から見て
              <select value={value.relation} onChange={(e) => onChange({ ...value, relation: e.target.value as SiblingRelation | "" })} style={field}>
                <option value="">えらぶ</option>
                {SIBLING_RELATIONS.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </label>
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
            お話の中の「{parent}」が、この子になります。絵では、この年齢の子どもとして描きます。
          </p>
        </div>
      )}
    </div>
  );
}
