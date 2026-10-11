import type { SeriesId } from "./story-key";

export type { SeriesId };

// 台本（シリーズ）の見本の絵。作例と同じ架空の家族（主人公「はると」とママ・パパ）と相棒で、各話の表紙と12場面を水彩で描く。
// 絵は公開ストレージ（samples）の series/ に置く。表紙と12場面がそろった話から、お客様が選べるようになる。

export type SeriesScene = {
  /** 画面に出す短い説明（台本の「絵」の欄） */
  label: string;
  /** AI に渡す場面の説明（英語） */
  art: string;
  withMom?: boolean;
  withDad?: boolean;
  /** 相棒（森ならりすのポッケ）が出る場面 */
  withSidekick?: boolean;
};

/** 絵スタジオで1枚ごとに書ける追加の指示の最大文字数 */
export const SERIES_NOTE_MAX = 200;

/** 1話の見本の絵の枚数（表紙＋12場面） */
export const SERIES_PAGES = 13;

/** シリーズの登場人物の設定画（家族3人＋相棒）。そのシリーズの絵はすべてこれを参考に描く */
export function seriesSheetPath(id: SeriesId) {
  return `series/${id}/characters.png`;
}

/** 0 が表紙、1〜12 が場面 */
export function seriesImagePath(id: SeriesId, episode: number, page: number) {
  return `series/${id}/ep${episode}/${page === 0 ? "cover" : String(page).padStart(2, "0")}.png`;
}
