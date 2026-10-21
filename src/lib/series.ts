import { SAMPLE_CHILD_NAME, SHOWCASE_PHOTO } from "./samples";
import type { CountRule } from "./count-check";
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
  /** 数を守りたい物（数のお勉強）。描いたあと数を確かめ、違えば描き直す（count-check.ts） */
  counts?: CountRule[];
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

/**
 * 家族写真を作例スタジオの「この写真から」①（トップの写真）と共用するシリーズ。
 * 2026-10-12 作道さん：トップとサンプル集で同じ家族に見せる。写真は作例スタジオで作り、絵スタジオでは作らない
 */
const SHOWCASE_PHOTO_SERIES: SeriesId[] = ["forest"];

export function usesShowcasePhoto(id: SeriesId) {
  return SHOWCASE_PHOTO_SERIES.includes(id);
}

/** サンプル集に出す、シリーズの家族（設定画の3人）そっくりの架空の家族写真。左からママ・主人公・パパの順に並ぶ */
export function seriesFamilyPhotoPath(id: SeriesId) {
  return usesShowcasePhoto(id) ? SHOWCASE_PHOTO : `series/${id}/family-photo.png`;
}

/** 0 が表紙、1〜12 が場面 */
export function seriesImagePath(id: SeriesId, episode: number, page: number) {
  return `series/${id}/ep${episode}/${page === 0 ? "cover" : String(page).padStart(2, "0")}.png`;
}

/**
 * 各話の見本の場面を横長（見開き）で描いたときの、文の置き場所（AIが絵を見て決める）。JSON で絵の隣に保存。
 * 2026-10-16 作道さん：お客様の本が見開きになったので、見本も横長で作って確かめる
 */
export function seriesImageTextPath(id: SeriesId, episode: number, page: number) {
  return seriesImagePath(id, episode, page).replace(/\.png$/, "-text.json");
}

/** 見本の場面を見開きで描くとき、文を置くページ（お客様の本・見開き版の本と同じく、場面ごとに右・左を交互に） */
export function seriesSceneTextSide(page: number): "left" | "right" {
  return page % 2 === 1 ? "right" : "left";
}

/** 見開きの試作の絵（場面1〜12。今の場面の絵とは別に保存し、お客様の本には使わない） */
export function seriesSpreadPath(id: SeriesId, episode: number, page: number) {
  return `series/${id}/ep${episode}/spread-${String(page).padStart(2, "0")}.png`;
}

/** 見開きの試作で、文を置く場所（人物や動物のいない所。AIが絵を見て決める）。JSON で絵の隣に保存 */
export function seriesSpreadTextPath(id: SeriesId, episode: number, page: number) {
  return seriesSpreadPath(id, episode, page).replace(/\.png$/, "-text.json");
}

/** 見開きの文の置き場所：左右どちらのページの、上・真ん中・下か */
export const SPREAD_TEXT_SPOTS = ["left-top", "left-middle", "left-bottom", "right-top", "right-middle", "right-bottom"] as const;
export type SpreadTextSpot = (typeof SPREAD_TEXT_SPOTS)[number];

/**
 * 見開き版の本の試作（2026-10-15 作道さん）：写真の組み合わせ（ママとパパ / ママだけ / パパだけ / 子どもだけ）ごとに、
 * 12場面を見開きの絵で描いて、表紙から最後のページまで本の形で確かめる。お客様の本には使わない
 */
export function seriesBookSpreadPath(id: SeriesId, episode: number, combo: string, page: number) {
  return `series/${id}/ep${episode}/book-${combo}/spread-${String(page).padStart(2, "0")}.png`;
}

export function seriesBookSpreadTextPath(id: SeriesId, episode: number, combo: string, page: number) {
  return seriesBookSpreadPath(id, episode, combo, page).replace(/\.png$/, "-text.json");
}

/** 見開き版の本の、ひとり分のキャラクターの絵（登場人物しょうかいのページ用。その話の服で描く） */
export function seriesCharacterPath(id: SeriesId, episode: number, who: "child" | "mom" | "dad") {
  return `series/${id}/ep${episode}/chara-${who}.png`;
}

/**
 * 登場人物しょうかいのページに出す、相棒（森ならりすのポッケ）ひとりだけの絵。相棒は話や服で変わらないので、シリーズに1枚。
 * 見本の本・自分の写真の本・お客様の本のどれでも同じ絵を使う（2026-10-15 作道さん「登場人物にポッケも」）
 */
export function seriesSidekickPath(id: SeriesId) {
  return `series/${id}/chara-sidekick.png`;
}

/** 相棒の名前（例：「相棒のりす「ポッケ」」→「ポッケ」） */
export function sidekickShortName(label: string) {
  return label.match(/「(.+?)」/)?.[1] ?? label;
}

/** 見開き版の本を並べた画像（見開きごと）とPDF。level は文の量（s / n / l） */
export function seriesBookViewPath(id: SeriesId, episode: number, combo: string, level: string, index: number) {
  return `series/${id}/ep${episode}/book-${combo}/view-${level}-${String(index).padStart(2, "0")}.jpg`;
}

export function seriesBookPdfPath(id: SeriesId, episode: number, combo: string, level: string) {
  return `series/${id}/ep${episode}/book-${combo}/book-${level}.pdf`;
}

// --- 絵スタジオ「自分の写真で試す」（2026-10-15 作道さん：見開き版の本を自分の家族の写真で作って確かめる）---
// 本物の家族の写真なので、公開の samples ではなく非公開の books に置き、画面には期限付きのURLで出す。
// 写真はシリーズ共通（同じ家族）。絵はシリーズ・話・組み合わせごと。
const OWN_ROOT = "studio-own";

export function ownPhotoPath(who: "child" | "mom" | "dad") {
  return `${OWN_ROOT}/photo-${who}.jpg`;
}

/** 写真の3人（いる人）から描いた、そのシリーズの設定画（家族＋相棒） */
export function ownSheetPath(id: SeriesId) {
  return `${OWN_ROOT}/${id}/characters.png`;
}

export function ownCoverPath(id: SeriesId, episode: number) {
  return `${OWN_ROOT}/${id}/ep${episode}/cover.png`;
}

export function ownCharacterPath(id: SeriesId, episode: number, who: "child" | "mom" | "dad") {
  return `${OWN_ROOT}/${id}/ep${episode}/chara-${who}.png`;
}

export function ownBookSpreadPath(id: SeriesId, episode: number, combo: string, page: number) {
  return `${OWN_ROOT}/${id}/ep${episode}/book-${combo}/spread-${String(page).padStart(2, "0")}.png`;
}

export function ownBookSpreadTextPath(id: SeriesId, episode: number, combo: string, page: number) {
  return ownBookSpreadPath(id, episode, combo, page).replace(/\.png$/, "-text.json");
}

export function ownBookViewPath(id: SeriesId, episode: number, combo: string, level: string, index: number) {
  return `${OWN_ROOT}/${id}/ep${episode}/book-${combo}/view-${level}-${String(index).padStart(2, "0")}.jpg`;
}

export function ownBookPdfPath(id: SeriesId, episode: number, combo: string, level: string) {
  return `${OWN_ROOT}/${id}/ep${episode}/book-${combo}/book-${level}.pdf`;
}
