import "server-only";
import { STORIES, type Scene } from "./catalog";
import { LEVELS, getSeriesInfo, parseSeriesKey, type Combo, type SeriesId } from "./story-key";
import { SERIES_DATA, type Continuity, type SeriesSceneData } from "./series-data";
import { parseCustomKey } from "./custom-story";

// 注文の「お話の番号」から、絵本の中身（表紙の絵・12場面の文と絵）を組み立てる（サーバー専用）。
// 旧版の1話だけのお話は catalog.ts の STORIES、シリーズは src/data/series/*.json（確定した台本）から。

export type BookScene = Scene & {
  withSidekick?: boolean;
  /** カメラの位置・構図（英語） */
  camera?: string;
  /** オリジナルのお話で、この場面に出るほかの登場人物（cast の番号） */
  guests?: number[];
  /** オリジナルのお話で、場所・屋内か屋外か・時間帯（英語） */
  setting?: string;
};

export type Book = {
  key: string;
  /** 表紙・扉の題名 */
  name: string;
  cover: string;
  coverWithSidekick?: boolean;
  coverCamera?: string;
  scenes: BookScene[];
  /** オリジナルのお話のとき、本文に 漢字《かな》 のふりがながある（文の量が「多い」） */
  ruby?: boolean;
  /** オリジナルのお話の、ほかの登場人物（名前と、絵での見た目） */
  cast?: { name: string; kind: "person" | "animal"; look: string }[];
  /** 表紙に出る、ほかの登場人物（cast の番号） */
  coverGuests?: number[];
  /** オリジナルのお話全体の決まりごと（英語。誰の家か・亡くなった人や動物・屋内では靴をぬぐ など） */
  facts?: string;
  /** シリーズのお話のときだけ */
  series?: {
    id: SeriesId;
    name: string;
    episode: number;
    title: string;
    /** 相棒の見た目（英語）。相棒が出る場面の絵の指示に入れる */
    sidekick: string;
    /** 相棒以外の名前のある登場人物の見た目（英語） */
    cast: Record<string, string>;
    /** 何度も出てくる場所や物の見た目（英語） */
    props: Record<string, string>;
    /** その話の季節の服装（英語） */
    outfits: string | null;
    /** 持ち物・身に着ける物などのページごとの決まり */
    continuity: Continuity[];
    /** 本文に 漢字《かな》 のふりがながある（文の量が「多い」） */
    ruby: boolean;
  };
};

/** 写真の組み合わせに合わせて、場面の文と絵を選ぶ。シリーズの表は「その場面の親」が出る形で書いてあり、違う組み合わせは alt にある */
function pick(scene: SeriesSceneData, combo: Combo, level: number): BookScene {
  const v = scene.alt?.[combo] ?? scene;
  return { text: v.text[level], art: v.art, withMom: v.withMom, withDad: v.withDad, withSidekick: v.withSidekick, camera: v.camera ?? scene.camera };
}

export function getBook(key: string | null | undefined): Book | null {
  const legacy = STORIES.find((s) => s.id === key);
  if (legacy) return { key: legacy.id, name: legacy.name, cover: legacy.cover, scenes: legacy.scenes };

  const custom = parseCustomKey(key);
  if (custom) {
    return {
      key: key!,
      name: custom.title,
      cover: custom.cover,
      scenes: custom.scenes.map((s) => ({
        text: s.text,
        art: s.art,
        withMom: s.withMom,
        withDad: s.withDad,
        guests: s.guests,
        setting: s.setting || undefined,
        camera: s.camera || undefined,
      })),
      ruby: custom.level === "l",
      cast: custom.cast.map(({ name, kind, look }) => ({ name, kind, look })),
      coverGuests: custom.coverGuests,
      facts: custom.facts || undefined,
    };
  }

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
    coverCamera: ep.cover.camera,
    scenes: ep.scenes.map((s) => pick(s, combo, level)),
    series: {
      id: k.series,
      name: info.name,
      episode: ep.no,
      title: ep.title,
      sidekick: data.sidekick,
      cast: data.cast,
      props: data.props ?? {},
      outfits: ep.outfits,
      continuity: ep.continuity ?? [],
      ruby: k.level === "l",
    },
  };
}
