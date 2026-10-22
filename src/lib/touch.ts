// 手描き風タッチの試作（2026-10-22 作道さん「まるでAIではない感じのタッチをAIで表現できる？」）。
// まだお客様には出さない。管理画面の「タッチ試作」で、森1話の1場面を作例の家族写真から描いて見比べるだけ。
// 既存の絵本の作品名・キャラクター名は指示に書かず、画材と描き方だけで指定する（作道さんと合意）。

export const TOUCH_IDS = ["acrylic", "flat", "pencil"] as const;
export type TouchId = (typeof TOUCH_IDS)[number];

export type Touch = { id: TouchId; label: string; lead: string; prompt: string };

export const TOUCHES: Touch[] = [
  {
    id: "acrylic",
    label: "厚塗りアクリル",
    lead: "子どもの手描きのような歪んだ線、もっとデフォルメ、木は丸や三角に",
    // 2026-10-22 作道さん：質感はこれが一番近いが線がAIっぽい → 線のランダムさ・デフォルメ・背景の単純化を強める
    prompt:
      "ART STYLE: painted by hand with thick, opaque acrylic paint on rough paper, in the naive, childlike manner of a picture book illustrated to look as if a young child painted it. " +
      "Visible brush strokes and dry-brush streaks in every color area, uneven paint coverage where the paper texture shows through, lumpy imperfect shapes. " +
      "The outlines are the most important part: thick dark lines painted with a clumsy brush, wobbly, crooked and shaky, varying a lot in thickness, overshooting corners, breaking off and restarting, never smooth, never evenly weighted, never following the shape precisely, so the drawing feels spontaneous and random like a child's painting. " +
      "Strong deformation: heads about one third of the body height, round and a little lopsided, stubby bodies and arms, mitten hands, uneven eyes drawn as two simple dark dots, a tiny mark for the nose, a single curved line for the mouth, round blush spots. " +
      "Everything is strongly abstracted and simplified: trees are just plain shapes such as a brown stick with a green blob or triangle on top, with no leaves, branches, bark or texture painted inside; grass and sky are single flat areas of color with rough edges. Bold, warm, slightly muted colors mixed by hand",
  },
  {
    id: "flat",
    label: "太い黒線・ベタ塗り",
    lead: "太さのそろった黒い輪郭、グラデーションなし",
    prompt:
      "ART STYLE: hand-painted with flat poster color on paper. Every shape is outlined with a bold black line of almost the same thickness everywhere, drawn by hand so it wobbles a little. " +
      "Each area is filled with one single flat, bright color with no gradients, no shading and no highlights at all; only a faint hand-painted unevenness inside the flat colors. Very simple, rounded, graphic shapes",
  },
  {
    id: "pencil",
    label: "色鉛筆・パステル",
    lead: "ざらざらの紙目、鉛筆の下描きが残る、塗り残しあり",
    prompt:
      "ART STYLE: drawn by hand with colored pencils and soft oil pastels on textured drawing paper. The paper grain shows clearly through every color, colors are built up with visible hatching and scribbly strokes, " +
      "and some areas are left unfilled so the white paper shows. Thin, slightly shaky graphite pencil sketch lines remain visible around and inside the shapes. Soft, gentle colors",
  },
];

export function getTouch(id: string) {
  return TOUCHES.find((t) => t.id === id) ?? null;
}

/** 試作の絵の置き場所（公開ストレージ samples）。タッチごとに最後の1枚だけ残す */
export function touchImagePath(id: TouchId) {
  return `trial/touch/${id}.png`;
}
