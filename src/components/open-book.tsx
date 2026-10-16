import type { ReactNode } from "react";

// 見開きの絵を「開いた本」に見せる枠（2026-10-15 作道さん：プレビューで、横長の絵の真ん中に絵本の折れ目を描き、
// 本の厚みを少し出して、実物はこんな感じと思い浮かべられるように）。
// 絵は 2:1（印刷される範囲と同じ。横長 3:2 の絵の上下を切る）。真ん中に綴じ目の影、下と左右にページの重なり（厚み）を描く。

/** 下と左右に重なって見えるページの縁（紙の色を交互にして、厚みに見せる） */
const PAGE_EDGES = [
  "-1px 2px 0 #fbf7ef",
  "1px 2px 0 #fbf7ef",
  "-2px 3px 0 #e6dfd1",
  "2px 3px 0 #e6dfd1",
  "-2px 5px 0 #fbf7ef",
  "2px 5px 0 #fbf7ef",
  "-3px 6px 0 #e2dacb",
  "3px 6px 0 #e2dacb",
  "-3px 8px 0 #f8f3ea",
  "3px 8px 0 #f8f3ea",
  "-4px 9px 0 #d9d0bf",
  "4px 9px 0 #d9d0bf",
  "0 18px 24px rgba(30, 47, 87, 0.24)",
].join(", ");

export function OpenBook({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: "relative", width: "100%", padding: "4px 2px 12px" }}>
      <div
        style={{
          position: "relative",
          aspectRatio: "2 / 1",
          borderRadius: "3px 3px 6px 6px",
          overflow: "hidden",
          background: "#fffaf0",
          boxShadow: PAGE_EDGES,
        }}
      >
        {children}
        {/* 綴じ目：真ん中に向かって紙が沈む影と、折れ目の細い線 */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "linear-gradient(to right, rgba(0,0,0,0) 34%, rgba(40,30,20,0.08) 43%, rgba(40,30,20,0.22) 48%, rgba(40,30,20,0.5) 49.7%, rgba(255,250,240,0.35) 50.15%, rgba(40,30,20,0.4) 50.6%, rgba(40,30,20,0.2) 52.5%, rgba(40,30,20,0.08) 57%, rgba(0,0,0,0) 66%)",
          }}
        />
        {/* 左右のページの外側が少し持ち上がって見える、ほのかな光 */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: "linear-gradient(to right, rgba(255,255,255,0.10), rgba(255,255,255,0) 12%, rgba(255,255,255,0) 88%, rgba(255,255,255,0.10))",
          }}
        />
      </div>
    </div>
  );
}
