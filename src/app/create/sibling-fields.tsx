"use client";

import { SIBLING_RELATIONS, type SiblingRelation } from "@/lib/catalog";

export type SiblingInput = { name: string; age: number | null; relation: SiblingRelation | "" };

/** 入力がそろっているか（名前・年齢・続柄） */
export function siblingComplete(s: SiblingInput | undefined) {
  return !!s && !!s.name.trim() && s.age !== null && !!s.relation;
}

const AGES = Array.from({ length: 19 }, (_, i) => i);

const field = { height: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 16, background: "#fff" };

/** 兄弟姉妹の呼び方・年齢・続柄の入力欄（主人公といっしょに冒険する兄弟姉妹の欄） */
export function SiblingFields({ value, onChange }: { value: SiblingInput; onChange: (v: SiblingInput) => void }) {
  return (
    <>
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
    </>
  );
}
