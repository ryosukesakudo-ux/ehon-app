import { SAMPLE_CHILD_NAME } from "./samples";
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
  /** カメラの位置・構図（英語） */
  camera?: string;
};

/**
 * 作例とは別の架空の家族で見本を描くシリーズの、主人公の名前（家族の見た目は illustrate.ts の SERIES_SAMPLE_CAST）。
 * 数のお勉強は 2026-10-12 作道さん「別の家族で」：3歳くらいの女の子とママ・パパ
 */
const SERIES_SAMPLE_CHILD_NAME: Partial<Record<SeriesId, string>> = { number: "みお" };

/**
 * 見本を「写真が先」で作るシリーズ。架空の家族写真を先に作り、設定画と場面はその写真に「写真そっくり」で寄せて描く
 * （お客様の写真から絵本ができる流れをそのまま見せる。2026-10-12 作道さん「写真に近いイラスト前提で」）。
 * 森も 2026-10-12 作道さん「絵が写真に似ていないと勘違いされる」で、今の家族写真をそのまま使い、設定画と場面を写真に寄せて作り直す。
 * ほかのシリーズは設定画が先で、家族写真はあとから設定画に似せて作る
 */
const PHOTO_FIRST_SERIES: SeriesId[] = ["number", "forest"];

export function isPhotoFirst(id: SeriesId) {
  return PHOTO_FIRST_SERIES.includes(id);
}

/** そのシリーズの見本の主人公の名前（ふつうは作例と同じ「はると」） */
export function seriesSampleChildName(id: SeriesId) {
  return SERIES_SAMPLE_CHILD_NAME[id] ?? SAMPLE_CHILD_NAME;
}

/** 絵スタジオで1枚ごとに書ける追加の指示の最大文字数 */
export const SERIES_NOTE_MAX = 200;

/** 1話の見本の絵の枚数（表紙＋12場面） */
export const SERIES_PAGES = 13;

/** シリーズの登場人物の設定画（家族3人＋相棒）。そのシリーズの絵はすべてこれを参考に描く */
export function seriesSheetPath(id: SeriesId) {
  return `series/${id}/characters.png`;
}

/** サンプル集に出す、シリーズの家族（設定画の3人）そっくりの架空の家族写真。左からママ・主人公・パパの順に並ぶ */
export function seriesFamilyPhotoPath(id: SeriesId) {
  return `series/${id}/family-photo.png`;
}

/** 0 が表紙、1〜12 が場面 */
export function seriesImagePath(id: SeriesId, episode: number, page: number) {
  return `series/${id}/ep${episode}/${page === 0 ? "cover" : String(page).padStart(2, "0")}.png`;
}
