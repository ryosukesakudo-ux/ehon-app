"use client";

import { useState } from "react";
import { jstDate } from "@/lib/catalog";

// お誕生日を年・月・日の3つのプルダウンで選ぶ。
// スマホの日付入力（type="date"）は今日の日付から始まり、何年も前の日付を選びにくい・端末によって選べないため。

const YEARS_BACK = 15;

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function BirthdaySelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const today = jstDate(0);
  const thisYear = Number(today.slice(0, 4));
  const [y, setY] = useState(0);
  const [mo, setMo] = useState(0);
  const [d, setD] = useState(0);
  // 外から値が入ったとき（保存していた入力の復元など）は、その日付を表示する
  const [shown, setShown] = useState<string | null>(null);
  if (value !== shown) {
    setShown(value);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) {
      setY(Number(m[1]));
      setMo(Number(m[2]));
      setD(Number(m[3]));
    } else {
      setY(0);
      setMo(0);
      setD(0);
    }
  }

  // 3つそろって、今日より前の正しい日付のときだけ保存する（それ以外は空欄扱い）
  function commit(ny: number, nmo: number, nd: number) {
    if (ny && nmo && nd > daysIn(ny, nmo)) nd = 0;
    setY(ny);
    setMo(nmo);
    setD(nd);
    const date = ny && nmo && nd ? `${ny}-${pad(nmo)}-${pad(nd)}` : "";
    const next = date && date <= today ? date : "";
    setShown(next);
    onChange(next);
  }

  const years = Array.from({ length: YEARS_BACK + 1 }, (_, i) => thisYear - i);
  const dayCount = y && mo ? daysIn(y, mo) : 31;
  const future = !!(y && mo && d) && `${y}-${pad(mo)}-${pad(d)}` > today;

  return (
    <>
      <div style={{ display: "flex", gap: 8 }}>
        <select id={id} aria-label="お誕生日の年" style={{ flex: 1.4, minWidth: 0 }} value={y || ""} onChange={(e) => commit(Number(e.target.value), mo, d)}>
          <option value="">年</option>
          {years.map((v) => (
            <option key={v} value={v}>{v}年</option>
          ))}
        </select>
        <select aria-label="お誕生日の月" style={{ flex: 1, minWidth: 0 }} value={mo || ""} onChange={(e) => commit(y, Number(e.target.value), d)}>
          <option value="">月</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((v) => (
            <option key={v} value={v}>{v}月</option>
          ))}
        </select>
        <select aria-label="お誕生日の日" style={{ flex: 1, minWidth: 0 }} value={d || ""} onChange={(e) => commit(y, mo, Number(e.target.value))}>
          <option value="">日</option>
          {Array.from({ length: dayCount }, (_, i) => i + 1).map((v) => (
            <option key={v} value={v}>{v}日</option>
          ))}
        </select>
      </div>
      {future && <p className="error" role="alert">今日より前の日付を選んでください</p>}
      {(y || mo || d) ? (
        <button type="button" className="ghost" style={{ alignSelf: "flex-start", height: 36, padding: "0 14px", fontSize: 13 }} onClick={() => commit(0, 0, 0)}>
          お誕生日を入れない
        </button>
      ) : null}
    </>
  );
}
