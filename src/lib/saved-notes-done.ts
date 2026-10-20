// 保存版のメモのうち、Claude が台本・絵の指示に入れて、お客様の本にも効くようにしたもの。
// キーは「シリーズ/話/保存版の日時/ページ」（ページは 0 が表紙、1〜12 が場面、all が一式全体）、値はどう入れたかの短い説明。
// 例："forest/1/20261020-225012/3": "場面3 のパパの服を青に（series-data の outfits）"
export const SAVED_NOTES_DONE: Record<string, string> = {};

export function savedNoteDone(series: string, episode: number, stamp: string, page: number | "all") {
  return SAVED_NOTES_DONE[`${series}/${episode}/${stamp}/${page}`] ?? null;
}
