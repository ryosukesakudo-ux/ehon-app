// スタジオ（/admin/studio）：オリジナルキャラの登録・設定画・台本・ショート動画を1か所で作る（2026-10-19 作道さん）。
// このファイルは画面とサーバーの両方で使う（Supabase や OpenAI には触らない）。
// キャラと台本は Supabase の studio_characters / studio_shorts に保存する（SQL: supabase/studio.sql）。
//
// 2026-10-20 止め絵方式に変更（作道さん「小石を歯で挟む瞬間が出ない」→ 動画AIは最初と最後の絵にいちばん従うので、見せ場を全部絵にする）:
//   1本＝止め絵（キーフレーム）2〜6枚 ＋ 絵と絵の間の短い動画（4/6/8秒）。各区間は Veo に「最初の絵＋最後の絵」を渡して作り、
//   最後に全区間をつないで1本にする（src/lib/mp4-concat.ts、再エンコードなし）。以前の「A 8秒＋延長7秒」はやめた。

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

/** 止め絵（キーフレーム）。お話の「見せ場」を止めた姿。1枚目は始まり、最後は終わり */
export type StudioKey = {
  /** この瞬間に何が見えているか（日本語） */
  scene: string;
  /** 絵の指示（英語） */
  frame: string;
};

/** 区間の長さ（秒）。Veo 3.1 が受け付けるのは 4・6・8 のみ */
export type SegmentSeconds = 4 | 6 | 8;
export const SEGMENT_SECONDS: SegmentSeconds[] = [4, 6, 8];

/** 絵 n と絵 n+1 の間の動画（Veo に最初の絵と最後の絵を渡して作る） */
export type StudioSegment = {
  /** 動きと音の指示（英語）。動作は1〜2個まで */
  motion: string;
  /** 効果音・鳴き声（日本語） */
  sound: string;
  seconds: SegmentSeconds;
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
  /** 止め絵。2〜KEYS_MAX 枚 */
  keys: StudioKey[];
  /** 区間。keys.length - 1 個 */
  segments: StudioSegment[];
  createdAt?: string;
};

export const QA_MAX = 12;
export const QA_ANSWER_MAX = 200;
export const KEYS_MIN = 2;
export const KEYS_MAX = 6;

export function emptyKey(): StudioKey {
  return { scene: "", frame: "" };
}
export function emptySegment(): StudioSegment {
  return { motion: "", sound: "", seconds: 6 };
}

export function emptyShort(): StudioShort {
  return { id: "", title: "", characterId: null, premise: "", qa: [], keys: [emptyKey(), emptyKey()], segments: [emptySegment()] };
}

export function toSeconds(v: unknown): SegmentSeconds {
  const n = Number(v);
  return n === 4 || n === 8 ? n : 6;
}

/** 合計の長さ（秒） */
export function totalSeconds(s: Pick<StudioShort, "segments">) {
  return s.segments.reduce((n, x) => n + x.seconds, 0);
}

/**
 * 以前の形（クリップA 8秒＋Bの延長7秒。clips: [a, b]）を止め絵の形に直す。
 * A の最初→絵1、A の最後→絵2、B の最後→絵3。A の動き→区間1（8秒）、B の動き→区間2（8秒）。
 */
export type LegacyClip = { id?: string; scene?: string; sound?: string; frame?: string; lastFrame?: string; motion?: string };
export function fromLegacyClips(clips: LegacyClip[]): Pick<StudioShort, "keys" | "segments"> {
  const a = clips[0] ?? {};
  const b = clips[1] ?? {};
  const keys: StudioKey[] = [
    { scene: a.scene ?? "", frame: a.frame ?? "" },
    { scene: "", frame: a.lastFrame ?? "" },
  ];
  const segments: StudioSegment[] = [{ motion: a.motion ?? "", sound: a.sound ?? "", seconds: 8 }];
  if (b.motion || b.lastFrame) {
    keys.push({ scene: b.scene ?? "", frame: b.lastFrame ?? "" });
    segments.push({ motion: b.motion ?? "", sound: b.sound ?? "", seconds: 8 });
  }
  return { keys, segments };
}

export const PREMISE_MAX = 300;
export const STUDIO_NOTE_MAX = 200;

// 絵と動画の置き場所（公開ストレージ samples）。番号は1から
export function studioKeyPath(shortId: string, n: number) {
  return `shorts/${shortId}/keys/${n}.png`;
}
export function studioSegmentPath(shortId: string, n: number) {
  return `shorts/${shortId}/segs/${n}.mp4`;
}
export function studioFullPath(shortId: string) {
  return `shorts/${shortId}/full.mp4`;
}
/** 以前の形の置き場所（取り込み用）。絵1〜3と区間1の動画 */
export function legacyKeyPath(shortId: string, n: number) {
  return n === 1 ? `shorts/${shortId}/a/frame.png` : n === 2 ? `shorts/${shortId}/a/last.png` : n === 3 ? `shorts/${shortId}/b/last.png` : null;
}
export function legacySegmentPath(shortId: string, n: number) {
  return n === 1 ? `shorts/${shortId}/a/video.mp4` : null;
}

/** 作った動画のアーカイブ（1本ごとに残す。キャラごとに何本でも作れるように、作り直しても古い動画は消さない：2026-10-19 作道さん） */
export function studioTakesDir(shortId: string) {
  return `shorts/${shortId}/takes`;
}
export type StudioTake = {
  /** ファイル名（takes/ の中）。例：20261019-213000-full-fast.mp4 */
  name: string;
  /** full＝完成の1本。a＝以前の形のクリップA（残っていれば見られる） */
  kind: "a" | "full";
  quality: VeoQuality | "";
  /** 作った日時（ISO） */
  at: string;
  url: string;
};

export type VeoQuality = "fast" | "standard";
/** 1秒あたりの目安（円）。Fast $0.10/秒・Standard $0.40/秒 を 1ドル150円で */
export const VEO_YEN_PER_SECOND: Record<VeoQuality, number> = { fast: 15, standard: 60 };
export function veoCost(quality: VeoQuality, seconds: number) {
  return VEO_YEN_PER_SECOND[quality] * seconds;
}
