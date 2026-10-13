"use client";

import { useState } from "react";

// お届け希望日のカレンダー。min より前・max より後の日は押せない（グレー表示）。
// スマホの標準の日付入力は機種によって min/max の外も選べてしまうため、自前で描く。
// 日付はすべて YYYY-MM-DD（日本時間の暦日）で扱う。

const WEEK = "日月火水木金土";

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function DatePicker({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min: string;
  max: string;
  onChange: (date: string) => void;
}) {
  // 最初に開く月：選んだ日があればその月、なければ選べる最初の日の月
  const start = value || min;
  const [month, setMonth] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 });
  const first = new Date(Date.UTC(month.y, month.m, 1));
  const days = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const canPrev = ymd(month.y, month.m, 1) > min;
  const canNext = ymd(month.y, month.m, days) < max;
  const move = (n: number) => setMonth(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));

  const navStyle = {
    width: 36,
    height: 36,
    border: "2px solid var(--line)",
    borderRadius: 18,
    background: "#fff",
    color: "var(--navy)",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
  } as const;

  return (
    <div style={{ border: "2px solid var(--line)", borderRadius: 16, padding: 12, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button type="button" aria-label="前の月" style={{ ...navStyle, opacity: canPrev ? 1 : 0.3 }} disabled={!canPrev} onClick={() => move(-1)}>
          ‹
        </button>
        <div className="display" style={{ fontSize: 15, fontWeight: 800, color: "var(--navy)" }}>
          {month.y}年{month.m + 1}月
        </div>
        <button type="button" aria-label="次の月" style={{ ...navStyle, opacity: canNext ? 1 : 0.3 }} disabled={!canNext} onClick={() => move(1)}>
          ›
        </button>
      </div>
      <div role="grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center" }}>
        {[...WEEK].map((w, i) => (
          <div key={w} style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? "#d0573c" : i === 6 ? "var(--blue)" : "var(--sub)", padding: "2px 0" }}>
            {w}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = ymd(month.y, month.m, i + 1);
          const ok = date >= min && date <= max;
          const selected = date === value;
          return (
            <button
              key={date}
              type="button"
              disabled={!ok}
              aria-pressed={selected}
              aria-label={`${month.m + 1}月${i + 1}日${ok ? "" : "（選べません）"}`}
              onClick={() => onChange(date)}
              style={{
                height: 38,
                border: 0,
                borderRadius: 19,
                fontSize: 14,
                fontWeight: selected ? 800 : 600,
                background: selected ? "var(--coral)" : ok ? "#eef6fc" : "transparent",
                color: selected ? "#fff" : ok ? "var(--navy)" : "#c4beb4",
                textDecoration: ok ? "none" : "line-through",
                cursor: ok ? "pointer" : "not-allowed",
              }}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
