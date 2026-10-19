// スタジオ（/admin/studio）：オリジナルキャラの登録・設定画・台本・ショート動画を1か所で作る（2026-10-19 作道さん）。
// このファイルは画面とサーバーの両方で使う（Supabase や OpenAI には触らない）。
// キャラと台本は Supabase の studio_characters / studio_shorts に保存する（SQL: supabase/studio.sql）。

import type { OriginalCharacter } from "./characters";

/** 登録したキャラ（コード直書きの ORIGINAL_CHARACTERS の項目＋顔の構造・動き方・並び順）。動画に効く要素はできるだけ詳しく（2026-10-19 作道さん） */
export type StudioCharacter = OriginalCharacter & {
  /** 顔の構造（日本語）：目と口がどこにあるか、開くとどう見えるか、描いてはいけない物 */
  faceJa: string;
  /** 動き方・癖（日本語）：歩き方、驚いたとき、怒ったとき、速さ */
  movementJa: string;
  /** 動き方の指示（英語・AIが書く） */
  movement: string;
  sort: number;
};

export const CHARACTER_FIELDS: { key: keyof Omit<StudioCharacter, "id" | "sort">; label: string; hint: string; en?: boolean; rows?: number }[] = [
  { key: "name", label: "名前", hint: "例：ガジリ（仮の名前でOK。商標は別途確認）" },
  { key: "base", label: "もとの物", hint: "例：どんぐり" },
  { key: "role", label: "役割", hint: "例：リーダー・行動派" },
  { key: "gross", label: "キモ要素", hint: "例：殻のふちがぜんぶ歯。帽子が開くと中にもう1列", rows: 2 },
  { key: "faceJa", label: "顔の構造（目と口の場所）", hint: "例：外皮に目はない。歯は帽子と殻のすき間だけ。帽子が開くと中の身に黒いまん丸の目2つと歯のない口。噛むのは殻の歯", rows: 3 },
  { key: "personality", label: "性格", hint: "例：せっかちで仲間思い。なんでもかじって確かめる", rows: 2 },
  { key: "movementJa", label: "動き方・癖", hint: "例：根っこで小刻みに走る。驚くと帽子がパカッと開く。考えるときは歯をカチカチ鳴らす", rows: 3 },
  { key: "catchphrase", label: "口ぐせ（絵本用。動画では話さない）", hint: "例：かじっていい？" },
  { key: "voiceJa", label: "鳴き声（動画用・言葉ではない声）", hint: "例：歯をカチカチ＋短く高い「キュッ」", rows: 2 },
  { key: "colors", label: "配色", hint: "例：茶 #8B5A2B・帽子 #5C3A1E・歯 #F2E8D5" },
  { key: "design", label: "見た目の指示（英語・AIが書く）", hint: "「AIに英語を書かせる」で日本語の設定から作れます。顔の構造（口と目の場所）を必ず含める", en: true, rows: 6 },
  { key: "voice", label: "鳴き声の指示（英語・AIが書く）", hint: "", en: true, rows: 2 },
  { key: "movement", label: "動き方の指示（英語・AIが書く）", hint: "", en: true, rows: 3 },
];

export function emptyCharacter(): StudioCharacter {
  return { id: "", name: "", base: "", role: "", gross: "", faceJa: "", personality: "", movementJa: "", catchphrase: "", voiceJa: "", voice: "", movement: "", colors: "", design: "", sort: 0 };
}

/** ショートの台本。1本＝クリップA（8秒、最初と最後の絵）＋クリップB（Aの動画を7秒延長）＝約15秒 */
export type StudioClip = {
  id: "a" | "b";
  /** 場面の説明（日本語） */
  scene: string;
  /** 効果音・鳴き声（日本語） */
  sound: string;
  /** 最初のコマの絵の指示（英語）。Bは延長なので使わない */
  frame: string;
  /** 最後のコマの絵の指示（英語）。Aは8秒時点、Bは15秒時点（延長の終わり） */
  lastFrame: string;
  /** 動きと音の指示（英語） */
  motion: string;
  /** Veo がこのクリップの動画を作ったときの URI（Aのみ。延長で bytes を断られたときの予備。数日で切れる） */
  videoUri?: string;
};

/** AIからの質問と作道さんの答え（台本を書く前のヒアリング） */
export type StudioQA = { q: string; a: string };

export type StudioShort = {
  id: string;
  title: string;
  characterId: string | null;
  /** ねらい・あらすじ（日本語、AIが台本を書くときの元） */
  premise: string;
  /** ヒアリングの質問と答え。AIが「足りない」と思う間は質問が増え、十分になると質問が0になる */
  qa: StudioQA[];
  clips: StudioClip[];
  createdAt?: string;
};

export const QA_MAX = 12;
export const QA_ANSWER_MAX = 200;

export const CLIP_IDS = ["a", "b"] as const;

export function emptyClip(id: "a" | "b"): StudioClip {
  return { id, scene: "", sound: "", frame: "", lastFrame: "", motion: "" };
}

export function emptyShort(): StudioShort {
  return { id: "", title: "", characterId: null, premise: "", qa: [], clips: [emptyClip("a"), emptyClip("b")] };
}

export const CLIP_FIELDS: { key: "scene" | "sound" | "frame" | "lastFrame" | "motion"; label: string; en?: boolean; rows?: number; onlyA?: boolean }[] = [
  { key: "scene", label: "場面（日本語）", rows: 2 },
  { key: "sound", label: "音・鳴き声（日本語）", rows: 1 },
  { key: "frame", label: "最初のコマの絵（英語）", en: true, rows: 3, onlyA: true },
  { key: "lastFrame", label: "最後のコマの絵（英語）", en: true, rows: 3 },
  { key: "motion", label: "動きと音（英語）", en: true, rows: 4 },
];

export const PREMISE_MAX = 300;
export const STUDIO_NOTE_MAX = 200;

// 絵と動画の置き場所（公開ストレージ samples）
export type StudioFrameKind = "first" | "last" | "lastB";
export function studioFramePath(shortId: string, which: StudioFrameKind) {
  if (which === "lastB") return `shorts/${shortId}/b/last.png`;
  return `shorts/${shortId}/a/${which === "last" ? "last" : "frame"}.png`;
}
export function studioVideoPath(shortId: string, which: "a" | "full") {
  return which === "a" ? `shorts/${shortId}/a/video.mp4` : `shorts/${shortId}/full.mp4`;
}

/** 作った動画のアーカイブ（1本ごとに残す。キャラごとに何本でも作れるように、作り直しても古い動画は消さない：2026-10-19 作道さん） */
export function studioTakesDir(shortId: string) {
  return `shorts/${shortId}/takes`;
}
export type StudioTake = {
  /** ファイル名（takes/ の中）。例：20261019-213000-full-fast.mp4 */
  name: string;
  kind: "a" | "full";
  quality: VeoQuality | "";
  /** 作った日時（ISO） */
  at: string;
  url: string;
};

export type VeoQuality = "fast" | "standard";
export const VEO_COST: Record<VeoQuality, { a: number; b: number }> = { fast: { a: 120, b: 105 }, standard: { a: 480, b: 420 } };
