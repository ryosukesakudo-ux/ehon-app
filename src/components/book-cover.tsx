import type { CSSProperties, ReactNode } from "react";

// 絵本の表紙の見た目（入稿用PDFの表紙と同じ組み方）。
// 正方形の上1/3にタイトルの帯、下2/3に横長（3:2）の表紙の絵を置く。文字と絵は重ねない。
export function BookCover({ lead, title, art, style }: { lead: string; title: string; art: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ aspectRatio: "1 / 1", width: "100%", display: "flex", flexDirection: "column", background: "#fff8ec", containerType: "inline-size", ...style }}>
      <div style={{ flex: "0 0 33.333%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.5cqw", padding: "0 6cqw", textAlign: "center" }}>
        <div className="display" style={{ fontSize: "5.2cqw", fontWeight: 800, color: "var(--coral)", lineHeight: 1.2 }}>{lead}</div>
        {/* 長い題名でも1行に収める */}
        <div className="display" style={{ fontSize: `min(8.4cqw, ${Math.floor(8600 / Math.max(title.length, 1)) / 100}cqw)`, fontWeight: 900, color: "var(--navy)", lineHeight: 1.2, whiteSpace: "nowrap" }}>{title}</div>
      </div>
      <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#E6EEF9" }}>{art}</div>
    </div>
  );
}
