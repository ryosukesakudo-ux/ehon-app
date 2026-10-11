import "server-only";
import { STORIES, type Scene } from "./catalog";
import { LEVELS, getSeriesInfo, parseSeriesKey, type Combo, type SeriesId } from "./story-key";
import { SERIES_DATA, type SeriesSceneData } from "./series-data";

// 注文の「お話の番号」から、絵本の中身（表紙の絵・12場面の文と絵）を組み立てる（サーバー専用）。
// 旧版の1話だけのお話は catalog.ts の STORIES、シリーズは src/data/series/*.json（確定した台本）から。

export type BookScene = Scene & { withSidekick?: boolean };

export type Book = {
  key: string;
  /** 表紙・扉の題名 */
  name: string;
  cover: string;
  coverWithSidekick?: boolean;
  scenes: BookScene[];
  /** シリーズのお話のときだけ */
  series?: {
    id: SeriesId;
    name: string;
    episode: number;
    title: string;
    /** 相棒の見た目（英語）。相棒が出る場面の絵の指示に入れる */
    sidekick: string;
    /** その話の季節の服装（英語） */
    outfits: string | null;
    /** 本文に 漢字《かな》 のふりがながある（文の量が「多い」） */
    ruby: boolean;
  };
};

/** 写真の組み合わせに合わせて、場面の文と絵を選ぶ。シリーズの表は「その場面の親」が出る形で書いてあり、違う組み合わせは alt にある */
function pick(scene: SeriesSceneData, combo: Combo, level: number): BookScene {
  const v = scene.alt?.[combo] ?? scene;
  return { text: v.text[level], art: v.art, withMom: v.withMom, withDad: v.withDad, withSidekick: v.withSidekick };
}

export function getBook(key: string | null | undefined): Book | null {
  const legacy = STORIES.find((s) => s.id === key);
  if (legacy) return { key: legacy.id, name: legacy.name, cover: legacy.cover, scenes: legacy.scenes };

  const k = parseSeriesKey(key);
  if (!k) return null;
  const data = SERIES_DATA[k.series];
  const info = getSeriesInfo(k.series)!;
  const ep = data.episodes.find((e) => e.no === k.episode);
  if (!ep) return null;
  const level = LEVELS.findIndex((l) => l.id === k.level);
  // 写真の組み合わせがまだ決まっていない（下書きを作る前）ときは、ママとパパの両方がいる形で読む
  const combo = k.combo ?? "both";
  return {
    key: key!,
    name: info.name,
    cover: ep.cover.art,
    coverWithSidekick: ep.cover.withSidekick,
    scenes: ep.scenes.map((s) => pick(s, combo, level)),
    series: {
      id: k.series,
      name: info.name,
      episode: ep.no,
      title: ep.title,
      sidekick: data.sidekick,
      outfits: ep.outfits,
      ruby: k.level === "l",
    },
  };
}
