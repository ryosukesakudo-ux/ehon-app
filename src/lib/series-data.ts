import "server-only";
import forest from "@/data/series/forest.json";
import star from "@/data/series/star.json";
import birthday from "@/data/series/birthday.json";
import sea from "@/data/series/sea.json";
import dinosaur from "@/data/series/dinosaur.json";
import number from "@/data/series/number.json";
import type { Combo, SeriesId } from "./story-key";

// 確定した台本（/mnt/project-files/stories/*-script.md、Claude Doc で 2026-10-11 承認）を、サイトで使う形にしたデータ。
// text は文の量（少ない・普通・多い）の順（数のお勉強は文が1種類なので、3つとも同じ文）。多いは 漢字《かな》 でふりがなを書いている。{name} は主人公の名前。
// 各場面は「その場面の親」が出る形（ママ場面はママだけ…）で、ほかの写真の組み合わせの文と絵は alt にある。

export type SeriesVersion = {
  label: string;
  art: string;
  text: string[];
  withMom: boolean;
  withDad: boolean;
  withSidekick: boolean;
  /** カメラの位置・構図（英語）。写真の組み合わせごとの版は、その版の人物に合わせて書いてある */
  camera?: string;
};

export type SeriesSceneData = SeriesVersion & {
  alt?: Partial<Record<Combo, SeriesVersion>>;
};

/** 話の中で絵をそろえる決まり。from〜to（表紙0、場面1〜12）のページにだけ付ける。省略時は全ページ */
export type Continuity = { from?: number; to?: number; text: string };

export type SeriesData = {
  id: SeriesId;
  name: string;
  sidekick: string;
  sidekickLabel: string;
  /** 相棒以外の名前のある登場人物の見た目（英語）。絵の指示に名前が出る場面で、見た目の説明を足す */
  cast: Record<string, string>;
  /** 何度も出てくる場所や物の見た目（英語）。キーの語句が絵の指示に出る場面で、見た目の説明を足す */
  props?: Record<string, string>;
  episodes: {
    no: number;
    title: string;
    outfits: string | null;
    /** その話の中で変わらない（または途中で変わる）持ち物・身に着ける物。from〜to はページ（表紙0、場面1〜12） */
    continuity?: Continuity[];
    cover: { label: string; art: string; withSidekick: boolean; camera?: string };
    scenes: SeriesSceneData[];
  }[];
};

export const SERIES_DATA = { forest, star, birthday, sea, dinosaur, number } as Record<SeriesId, SeriesData>;
