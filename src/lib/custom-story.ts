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
/** ほかの登場人物（ペットやおばあちゃんなど）は5人まで。名前と「どんな人・動物か」の長さ */
export const MAX_CAST = 5;
export const CAST_NAME_MAX = 10;
export const CAST_ABOUT_MAX = 30;
const LOOK_MAX = 300;

export type CustomScene = {
  /** 本文（お客様が直せる） */
  text: string;
  /** 挿絵の内容（英語・サーバーで作ったもの） */
  art: string;
  withMom: boolean;
  withDad: boolean;
  /** この場面に出る、ほかの登場人物（cast の番号・0から） */
  guests: number[];
};

export type CastKind = "person" | "animal";
export const CAST_KIND_LABEL: Record<CastKind, string> = { person: "人", animal: "動物" };

/** ほかの登場人物（主人公・ママ・パパ以外）。お話の画面で名前と種類を入れ、写真の画面で写真を選ぶ */
export type CastMember = {
  /** 名前（本文に出る） */
  name: string;
  kind: CastKind;
  /** どんな人・動物か（任意。例：うちの犬・ミニチュアシュナウザー） */
  about: string;
  /** 絵での見た目の説明（英語・サーバーで作ったもの） */
  look: string;
};

/** お話を作るときに入れる、ほかの登場人物 */
export type CastInput = Pick<CastMember, "name" | "kind" | "about">;

export type CustomStory = {
  title: string;
  level: LevelId;
  /** 表紙の絵の内容（英語） */
  cover: string;
  scenes: CustomScene[];
  /** ほかの登場人物（いなければ空） */
  cast: CastMember[];
  /** 表紙に出る、ほかの登場人物（cast の番号） */
  coverGuests: number[];
  /** 絵の内容の署名 */
  sig: string;
};

const str = (v: unknown, max: number) => (typeof v === "string" && [...v].length <= max ? v : null);

/** 署名する中身（絵の内容と、場面ごとのママ・パパ・ほかの登場人物の登場、登場人物の見た目） */
export function signedPayload(s: Pick<CustomStory, "cover" | "scenes" | "level" | "cast" | "coverGuests">) {
  // ほかの登場人物がいないお話は以前と同じ形（以前に作って保存しているお話もそのまま使えるように）
  if (!s.cast.length) return JSON.stringify([s.level, s.cover, s.scenes.map((x) => [x.art, x.withMom, x.withDad])]);
  return JSON.stringify([
    s.level,
    s.cover,
    s.scenes.map((x) => [x.art, x.withMom, x.withDad, x.guests]),
    s.cast.map((c) => [c.kind, c.look]),
    s.coverGuests,
  ]);
}

/** 登場人物の番号のリスト（重複・範囲外を除く） */
function guestList(v: unknown, count: number) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < count))].sort((a, b) => a - b);
}

function parseCast(v: unknown): CastMember[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_CAST) return null;
  const out: CastMember[] = [];
  for (const c of v) {
    const name = str(c?.name, CAST_NAME_MAX);
    const about = str(c?.about ?? "", CAST_ABOUT_MAX);
    const look = str(c?.look, LOOK_MAX);
    if (!name?.trim() || about === null || !look || (c.kind !== "person" && c.kind !== "animal")) return null;
    out.push({ name, kind: c.kind, about, look });
  }
  return out;
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
    const cast = parseCast(v?.cast);
    if (title === null || !cover || sig === null || !level || !cast || !Array.isArray(v.scenes) || v.scenes.length !== CUSTOM_SCENES) return null;
    const scenes: CustomScene[] = [];
    for (const s of v.scenes) {
      const text = str(s?.text, CUSTOM_TEXT_MAX);
      const art = str(s?.art, ART_MAX);
      if (text === null || !art) return null;
      scenes.push({ text, art, withMom: s.withMom === true, withDad: s.withDad === true, guests: guestList(s.guests, cast.length) });
    }
    return { title, level, cover, scenes, cast, coverGuests: guestList(v.coverGuests, cast.length), sig };
  } catch {
    return null;
  }
}

/** 注文できる形か（題名と全ページの文が入っている） */
export function customStoryComplete(s: CustomStory | null) {
  return !!s && !!s.title.trim() && s.scenes.every((x) => x.text.trim().length > 0);
}

/**
 * 下書きに保存したお話から、ほかの登場人物の写真の保存先を読む（サーバーが下書きを作るときに入れる。お客様からは送れない）。
 * 写真が無い人は null。
 */
export function customPhotos(key: string | null | undefined): (string | null)[] {
  if (!isCustomKey(key)) return [];
  try {
    const v = JSON.parse(key.slice(CUSTOM_PREFIX.length));
    return Array.isArray(v?.photos) ? v.photos.map((p: unknown) => (typeof p === "string" && p ? p : null)) : [];
  } catch {
    return [];
  }
}

/** 下書きに保存するお話（写真の保存先を足す） */
export function customKeyWithPhotos(story: CustomStory, photos: (string | null)[]) {
  return CUSTOM_PREFIX + JSON.stringify({ ...story, photos });
}

/** 登場人物の呼び名（例：コロ（うちの犬）） */
export function castLabel(c: Pick<CastMember, "name" | "about" | "kind">) {
  return `${c.name}（${c.about.trim() || CAST_KIND_LABEL[c.kind]}）`;
}
