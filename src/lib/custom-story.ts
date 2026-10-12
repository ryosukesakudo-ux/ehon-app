import type { LevelId } from "./story-key";

// お客様が考えたお話（オリジナルのお話）。
// あらすじからAIが題名・12場面の文・絵の内容を作り、文はお客様が自由に直せる。
// 下書きの「お話の番号」（drafts.story）に "custom:" ＋ JSON として丸ごと入れる（データベースの変更なしで、写真を消したあとも同じ本文で印刷できるように）。
// 絵の内容（英語）はサーバーで作ったものだけを使えるよう、署名（sig）を付ける。文と題名はお客様が直すので署名に入れない。
// ブラウザでも使うので、署名の確認は custom-story-server.ts（サーバー専用）で行う。

export const CUSTOM_PREFIX = "custom:";
export const CUSTOM_SCENES = 12;
export const SYNOPSIS_MAX = 150;
export const CUSTOM_TITLE_MAX = 20;
/** 1場面の文の長さの上限（文の量「多い」でも収まる長さ） */
export const CUSTOM_TEXT_MAX = 300;
const ART_MAX = 700;

export type CustomScene = {
  /** 本文（お客様が直せる） */
  text: string;
  /** 挿絵の内容（英語・サーバーで作ったもの） */
  art: string;
  withMom: boolean;
  withDad: boolean;
};

export type CustomStory = {
  title: string;
  level: LevelId;
  /** 表紙の絵の内容（英語） */
  cover: string;
  scenes: CustomScene[];
  /** 絵の内容の署名 */
  sig: string;
};

const str = (v: unknown, max: number) => (typeof v === "string" && [...v].length <= max ? v : null);

/** 署名する中身（絵の内容と、場面ごとのママ・パパの登場） */
export function signedPayload(s: Pick<CustomStory, "cover" | "scenes" | "level">) {
  return JSON.stringify([s.level, s.cover, s.scenes.map((x) => [x.art, x.withMom, x.withDad])]);
}

export function isCustomKey(key: string | null | undefined): key is string {
  return typeof key === "string" && key.startsWith(CUSTOM_PREFIX);
}

export function customKey(story: CustomStory) {
  return CUSTOM_PREFIX + JSON.stringify(story);
}

/** "custom:{...}" を読む。形がおかしければ null（署名は確かめない） */
export function parseCustomKey(key: string | null | undefined): CustomStory | null {
  if (!isCustomKey(key)) return null;
  try {
    const v = JSON.parse(key.slice(CUSTOM_PREFIX.length));
    const title = str(v?.title, CUSTOM_TITLE_MAX);
    const cover = str(v?.cover, ART_MAX);
    const sig = str(v?.sig, 128);
    const level = v?.level === "s" || v?.level === "n" || v?.level === "l" ? (v.level as LevelId) : null;
    if (title === null || !cover || sig === null || !level || !Array.isArray(v.scenes) || v.scenes.length !== CUSTOM_SCENES) return null;
    const scenes: CustomScene[] = [];
    for (const s of v.scenes) {
      const text = str(s?.text, CUSTOM_TEXT_MAX);
      const art = str(s?.art, ART_MAX);
      if (text === null || !art) return null;
      scenes.push({ text, art, withMom: s.withMom === true, withDad: s.withDad === true });
    }
    return { title, level, cover, scenes, sig };
  } catch {
    return null;
  }
}

/** 注文できる形か（題名と全ページの文が入っている） */
export function customStoryComplete(s: CustomStory | null) {
  return !!s && !!s.title.trim() && s.scenes.every((x) => x.text.trim().length > 0);
}
