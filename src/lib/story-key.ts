import { STORIES } from "./catalog";

// 台本（シリーズ）のお話の選び方と、注文に保存する「お話の番号」。
// ブラウザでも使うので、ここには本文を入れない（本文は book.ts がサーバーで読む）。
//
// お話の番号（drafts.story）
// - 旧版の1話だけのお話： "forest" / "star" / "birthday"
// - シリーズの1話：       "forest:2:n"（シリーズ:話:文の量）
//   下書きを作るとき、写真の組み合わせを足して "forest:2:n:mom" のように保存する（写真を消したあとも同じ本文で印刷するため）

export type SeriesId = "forest" | "star" | "birthday" | "sea" | "dinosaur";
export type LevelId = "s" | "n" | "l";
/** 写真の組み合わせ：ママとパパ / ママだけ / パパだけ / 子どもだけ */
export type Combo = "both" | "mom" | "dad" | "none";

export const LEVELS: { id: LevelId; name: string; ages: string; note: string }[] = [
  { id: "s", name: "少ない", ages: "1〜3歳", note: "1場面に1文。読み聞かせのはじめに" },
  { id: "n", name: "普通", ages: "3〜6歳", note: "1場面に2〜3文。ひらがなで読みやすく" },
  { id: "l", name: "多い", ages: "6〜10歳", note: "1場面に4〜6文。漢字にふりがな付き" },
];

/** 年齢に合う文の量（選択画面の最初の選択） */
export function levelForAge(age: number | null): LevelId {
  if (!age) return "n";
  return age <= 3 ? "s" : age <= 6 ? "n" : "l";
}

export const SERIES_LIST: {
  id: SeriesId;
  name: string;
  description: string;
  episodes: { no: number; title: string; season: string }[];
}[] = [
  {
    id: "forest",
    name: "もりのだいぼうけん",
    description: "相棒のりす「ポッケ」と、森で春・夏・秋・冬をすごすお話",
    episodes: [
      { no: 1, title: "ひかる たねと おじいの き", season: "春" },
      { no: 2, title: "ほたるの かわの ひみつ", season: "夏" },
      { no: 3, title: "きんの どんぐりと チッチ", season: "秋" },
      { no: 4, title: "ゆきの よるの まいごの ふくろう", season: "冬" },
      { no: 5, title: "おじいの きの たんじょうび", season: "春" },
    ],
  },
  {
    id: "star",
    name: "ママとおほしさまのくに",
    description: "星の子「ポラ」と、夜空の国で1年をすごすお話",
    episodes: [
      { no: 1, title: "ほしの はしごと ながれぼし", season: "春" },
      { no: 2, title: "たなばたの あまのがわ", season: "夏" },
      { no: 3, title: "つきの うさぎと まんまる おつきさま", season: "秋" },
      { no: 4, title: "ゆきぐもの なみだ", season: "冬" },
      { no: 5, title: "ポラの ほしまつり", season: "春" },
    ],
  },
  {
    id: "birthday",
    name: "たんじょうびのまほう",
    description: "ねこのまほうつかい「ミント」と、毎年のたんじょう日にまほうの国へ",
    episodes: [
      { no: 1, title: "おかしの まちの ごしょうたい", season: "1回目のたんじょう日" },
      { no: 2, title: "くもの まちと ひつじの モコ", season: "2回目のたんじょう日" },
      { no: 3, title: "うみの そこの あわの まほう", season: "3回目のたんじょう日" },
      { no: 4, title: "ほしの きしゃと ちびドラゴン", season: "4回目のたんじょう日" },
      { no: 5, title: "ミントの たんじょうび", season: "5回目のたんじょう日" },
    ],
  },
  {
    id: "sea",
    name: "うみの たからさがし",
    description: "ちびふぐ「プクル」と、5まいの地図のかけらを集める海のお話",
    episodes: [
      { no: 1, title: "びんの てがみと いその カニ", season: "夏" },
      { no: 2, title: "さんごの うみの ちいさな こえ", season: "秋" },
      { no: 3, title: "ゆきの とうだいと ほしの ガラス", season: "冬" },
      { no: 4, title: "しずんだ ふねと くじらの ルル", season: "春" },
      { no: 5, title: "うみの そこの たからばこ", season: "夏" },
    ],
  },
  {
    id: "dinosaur",
    name: "きょうりゅうの たまご",
    description: "たまごから生まれた「モコ」を育てる、きょうりゅうのお話",
    episodes: [
      { no: 1, title: "ふしぎな たまご", season: "春" },
      { no: 2, title: "はじめての ごはん", season: "夏" },
      { no: 3, title: "よちよち モコと まるたの はし", season: "秋" },
      { no: 4, title: "ふぶきの よるの ゴツじい", season: "冬" },
      { no: 5, title: "にじの たにの おかあさん", season: "春" },
    ],
  },
];

/** お客様と絵スタジオに出す話の数。5話目は 2026-10-11 に一旦取り下げ（台本とデータは残している） */
export const OPEN_EPISODES = 4;

/** 注文できるシリーズ。まずは森だけを公開し、ほかは「準備中」にする（2026-10-11 作道さん） */
export const OPEN_SERIES: SeriesId[] = ["forest"];

export function isOpenSeries(id: SeriesId) {
  return OPEN_SERIES.includes(id);
}

/** 公開中の話だけ */
export function openEpisodes<E extends { no: number }>(episodes: E[]) {
  return episodes.filter((e) => e.no <= OPEN_EPISODES);
}

export type SeriesKey = { series: SeriesId; episode: number; level: LevelId; combo: Combo | null };

const KEY_RE = /^(forest|star|birthday|sea|dinosaur):([1-5]):([snl])(?::(both|mom|dad|none))?$/;

/** シリーズのお話の番号を読む。旧版のお話やおかしな値なら null */
export function parseSeriesKey(key: string | null | undefined): SeriesKey | null {
  const m = typeof key === "string" ? key.match(KEY_RE) : null;
  return m ? { series: m[1] as SeriesId, episode: Number(m[2]), level: m[3] as LevelId, combo: (m[4] as Combo | undefined) ?? null } : null;
}

export function seriesKey(series: SeriesId, episode: number, level: LevelId, combo?: Combo | null) {
  return `${series}:${episode}:${level}${combo ? `:${combo}` : ""}`;
}

/** 写真の組み合わせを外した番号（選択画面・保存用） */
export function withoutCombo(key: string) {
  const k = parseSeriesKey(key);
  return k ? seriesKey(k.series, k.episode, k.level) : key;
}

export function comboOf(hasMom: boolean, hasDad: boolean): Combo {
  return hasMom && hasDad ? "both" : hasMom ? "mom" : hasDad ? "dad" : "none";
}

export function getSeriesInfo(id: string) {
  return SERIES_LIST.find((s) => s.id === id);
}

/** 旧版のお話か、シリーズのお話の番号として正しいか */
export function isStoryKey(key: string) {
  return !!STORIES.find((s) => s.id === key) || !!parseSeriesKey(key);
}

/** 画面・メールに出すお話の名前（例：もりのだいぼうけん 第2話「ほたるの かわの ひみつ」） */
export function storyLabel(key: string | null | undefined) {
  const k = parseSeriesKey(key);
  if (!k) return STORIES.find((s) => s.id === key)?.name ?? "";
  const s = getSeriesInfo(k.series)!;
  const ep = s.episodes.find((e) => e.no === k.episode)!;
  return `${s.name} 第${ep.no}話「${ep.title}」`;
}

/** 文の量の名前（シリーズのお話だけ） */
export function levelLabel(key: string | null | undefined) {
  const k = parseSeriesKey(key);
  const l = k && LEVELS.find((x) => x.id === k.level);
  return l ? `${l.name}（${l.ages}）` : "";
}

/**
 * 本の題名（表紙・扉に使う）。lead は上の小さい行、main は大きい行。
 * シリーズは「はるとの もりのだいぼうけん 第2話」＋「ほたるの かわの ひみつ」
 */
export function bookTitle(key: string, childName: string) {
  const k = parseSeriesKey(key);
  if (!k) return { lead: `${childName}の`, main: STORIES.find((s) => s.id === key)?.name ?? "" };
  const s = getSeriesInfo(k.series)!;
  const ep = s.episodes.find((e) => e.no === k.episode)!;
  return { lead: `${childName}の ${s.name} 第${ep.no}話`, main: ep.title };
}
