import { STORIES } from "./catalog";
import { parseCustomKey } from "./custom-story";

// 台本（シリーズ）のお話の選び方と、注文に保存する「お話の番号」。
// ブラウザでも使うので、ここには本文を入れない（本文は book.ts がサーバーで読む）。
//
// お話の番号（drafts.story）
// - 旧版の1話だけのお話： "forest" / "star" / "birthday"
// - シリーズの1話：       "forest:2:n"（シリーズ:話:文の量）
//   下書きを作るとき、写真の組み合わせを足して "forest:2:n:mom" のように保存する（写真を消したあとも同じ本文で印刷するため）
// - オリジナルのお話：     "custom:{...}"（custom-story.ts。お話の中身をそのまま入れる）

export type SeriesId = "forest" | "star" | "birthday" | "sea" | "dinosaur" | "number" | "hero" | "princess";
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
  /**
   * level・ages は、文の量が話ごとに1つに決まっているシリーズ（数のお勉強）だけ。
   * お話選びで文の量を選ばせず、対象年齢を表示する
   */
  episodes: { no: number; title: string; season: string; level?: LevelId; ages?: string }[];
  /** お話選びに出す、向いている子の目安（例：男の子に人気） */
  audience?: string;
  /** 女の子だけが選べる（呼び方が「くん」だと選べない。2026-10-23 作道さん：プリンセスはシンデレラ役なので女の子向け） */
  girlsOnly?: boolean;
  /** ママ・パパが出ないお話（写真はお子さまだけ） */
  noParents?: boolean;
  /** 絵のタッチが決まっているシリーズの、タッチの名前（えらんだタッチは使わない） */
  styleName?: string;
  /** お客様が服を選ぶシリーズの、服の呼び方（例：ヒーロースーツ）。選択肢は台本の outfitChoices（/api/series/outfits） */
  outfitLabel?: string;
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
  {
    // 2026-10-12 作道さん：数のお勉強。1話完結で、文は話ごとに対象年齢の1種類だけ（台本 /mnt/project-files/stories/number-script.md）
    id: "number",
    name: "かずの くにの だいぼうけん",
    description: "こぐまの「カゾエ」と、かぞえる・たす・ひくを楽しく覚えるお話",
    episodes: [
      { no: 1, title: "ひよこの かぞえうた", season: "春", level: "s", ages: "2〜3歳" },
      { no: 2, title: "100この ふうせん まつり", season: "夏", level: "s", ages: "2〜3歳" },
      { no: 3, title: "りんごの もりの あわせて パイ", season: "秋", level: "n", ages: "4〜6歳" },
      { no: 4, title: "ゆきの ひの クッキーやさん", season: "冬", level: "n", ages: "4〜6歳" },
    ],
  },
  {
    // 2026-10-22 作道さん（友人の助言）：男の子向けのヒーロー。少年まんが風のタッチ（2026-10-23 劇画風＝写実寄りのまんがに変更）。まずは1話だけ（台本 /mnt/project-files/stories/hero-script.md）
    // 2026-10-23 作道さんの流れで作り直し：ふしぎな扉の先で光の腕輪を手に入れ、メカの兵たいから町を救う。腕輪の色（力）を選ぶ
    id: "hero",
    name: "ひかりの ヒーロー",
    description: "ひかりの うでわの ちからで ヒーローに へんしんして、町を まもる お話",
    episodes: [{ no: 1, title: "えらばれし ヒーロー", season: "" }],
    audience: "男の子に人気",
    styleName: "リアルなまんが風",
    outfitLabel: "ちからの いろ",
  },
  {
    // 2026-10-22 作道さん：女の子向けのプリンセス。昔話のシンデレラの筋で、ママ・パパは出ない。今風のCGアニメのタッチ。まずは1話だけ
    id: "princess",
    name: "まほうの おひめさま",
    description: "小鳥の「ピピ」と、まほうのドレスでぶとうかいへ行くお話",
    episodes: [{ no: 1, title: "まよなかの ガラスの くつ", season: "" }],
    audience: "女の子向け",
    girlsOnly: true,
    noParents: true,
    styleName: "おひめさまアニメ風",
    outfitLabel: "ドレス",
  },
];

/** お客様と絵スタジオに出す話の数。5話目は 2026-10-11 に一旦取り下げ（台本とデータは残している） */
export const OPEN_EPISODES = 4;

/** サイト（お話選び）と絵スタジオに出すシリーズ。星・海・恐竜は 2026-10-12 に外した（台本とデータは残している。戻すときはここに足す） */
export const SHOWN_SERIES: SeriesId[] = ["forest", "birthday", "number", "hero", "princess"];

export const SHOWN_SERIES_LIST = SERIES_LIST.filter((s) => SHOWN_SERIES.includes(s.id));

/** 注文できるシリーズ。まずは森だけを公開し、ほかは「準備中」にする（2026-10-11 作道さん） */
export const OPEN_SERIES: SeriesId[] = ["forest", "hero", "princess"];

export function isOpenSeries(id: SeriesId) {
  return OPEN_SERIES.includes(id);
}

/**
 * 添削が終わって注文できる話。ほかの話は見本の絵があっても「Coming soon」で選べない（2026-10-12 作道さん）。
 * 2026-10-16 から、絵スタジオの「本番に出す」ボタンで変えられる（published-episodes.ts）。これはボタンを一度も押していないときの初期値
 */
export const PROOFREAD_EPISODES: Partial<Record<SeriesId, number[]>> = { forest: [1] };

export function isProofread(id: SeriesId, no: number) {
  return PROOFREAD_EPISODES[id]?.includes(no) ?? false;
}

/** 服を選ぶお話で、まだ服を選んでいないか */
export function needsOutfit(key: string) {
  const k = parseSeriesKey(key);
  return !!k && !!getSeriesInfo(k.series)?.outfitLabel && !k.outfit;
}

/** 公開中の話だけ */
export function openEpisodes<E extends { no: number }>(episodes: E[]) {
  return episodes.filter((e) => e.no <= OPEN_EPISODES);
}

/** 服を選ぶシリーズ（ヒーロー・プリンセス）で選んだ服の形と色（outfit-choice.ts）。番号の末尾 :w形-色（2026-10-23） */
export type OutfitPick = { type: string; color: string };

/** siblings：ママ・パパとは別に足した兄弟姉妹の人数（0〜2。下書きの番号の末尾 :k1 / :k2。2026-10-19） */
export type SeriesKey = { series: SeriesId; episode: number; level: LevelId; combo: Combo | null; siblings: number; outfit: OutfitPick | null };

const KEY_RE = /^(forest|star|birthday|sea|dinosaur|number|hero|princess):([1-5]):([snl])(?::(both|mom|dad|none))?(?::k([12]))?(?::w([a-z]+)-([a-z]+))?$/;

/** シリーズのお話の番号を読む。旧版のお話やおかしな値なら null */
export function parseSeriesKey(key: string | null | undefined): SeriesKey | null {
  const m = typeof key === "string" ? key.match(KEY_RE) : null;
  return m
    ? {
        series: m[1] as SeriesId,
        episode: Number(m[2]),
        level: m[3] as LevelId,
        combo: (m[4] as Combo | undefined) ?? null,
        siblings: Number(m[5] ?? 0),
        outfit: m[6] ? { type: m[6], color: m[7] } : null,
      }
    : null;
}

export function seriesKey(series: SeriesId, episode: number, level: LevelId, combo?: Combo | null, siblings = 0, outfit?: OutfitPick | null) {
  return `${series}:${episode}:${level}${combo ? `:${combo}` : ""}${combo && siblings ? `:k${siblings}` : ""}${outfit ? `:w${outfit.type}-${outfit.color}` : ""}`;
}

/** 写真の組み合わせを外した番号（選択画面・保存用）。選んだ服は残す */
export function withoutCombo(key: string) {
  const k = parseSeriesKey(key);
  return k ? seriesKey(k.series, k.episode, k.level, null, 0, k.outfit) : key;
}

export function comboOf(hasMom: boolean, hasDad: boolean): Combo {
  return hasMom && hasDad ? "both" : hasMom ? "mom" : hasDad ? "dad" : "none";
}

export function getSeriesInfo(id: string) {
  return SERIES_LIST.find((s) => s.id === id);
}

/** 旧版のお話か、シリーズのお話の番号として正しいか */
export function isStoryKey(key: string) {
  return !!STORIES.find((s) => s.id === key) || !!parseSeriesKey(key) || !!parseCustomKey(key);
}

/** 画面・メールに出すお話の名前（例：もりのだいぼうけん 第2話「ほたるの かわの ひみつ」） */
export function storyLabel(key: string | null | undefined) {
  const custom = parseCustomKey(key);
  if (custom) return `オリジナルのお話「${custom.title}」`;
  const k = parseSeriesKey(key);
  if (!k) return STORIES.find((s) => s.id === key)?.name ?? "";
  const s = getSeriesInfo(k.series)!;
  const ep = s.episodes.find((e) => e.no === k.episode)!;
  return `${s.name} 第${ep.no}話「${ep.title}」`;
}

/** 文の量が決まっている話なら、その話（level と対象年齢 ages）。文の量を選べる話は null */
export function fixedLevelEpisode(series: SeriesId, episode: number) {
  const ep = getSeriesInfo(series)?.episodes.find((e) => e.no === episode);
  return ep?.level ? (ep as { level: LevelId; ages?: string }) : null;
}

/** 文の量の名前（シリーズとオリジナルのお話）。文の量が決まっている話は対象年齢 */
export function levelLabel(key: string | null | undefined) {
  const k = parseSeriesKey(key);
  const fixed = k && fixedLevelEpisode(k.series, k.episode);
  if (fixed) return fixed.ages ? `${fixed.ages}向け` : "";
  const level = parseSeriesKey(key)?.level ?? parseCustomKey(key)?.level;
  const l = level && LEVELS.find((x) => x.id === level);
  return l ? `${l.name}（${l.ages}）` : "";
}

/**
 * 本の題名（表紙・扉に使う）。lead は上の小さい行、main は大きい行。
 * シリーズは「はるとの もりのだいぼうけん 第2話」＋「ほたるの かわの ひみつ」
 */
export function bookTitle(key: string, childName: string) {
  const custom = parseCustomKey(key);
  if (custom) return { lead: `${childName}の おはなし`, main: custom.title };
  const k = parseSeriesKey(key);
  if (!k) return { lead: `${childName}の`, main: STORIES.find((s) => s.id === key)?.name ?? "" };
  const s = getSeriesInfo(k.series)!;
  const ep = s.episodes.find((e) => e.no === k.episode)!;
  return { lead: `${childName}の ${s.name} 第${ep.no}話`, main: ep.title };
}
