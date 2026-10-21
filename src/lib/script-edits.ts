import "server-only";
import { SERIES_DATA, type SeriesData, type SeriesSceneData } from "./series-data";
import { BOOK_BUCKET, getSupabase } from "./services";
import type { Combo, SeriesId } from "./story-key";

// 台本の本文を管理画面（/admin/series/script）で直したもの（2026-10-21 作道さん「台本も修正できるようにしたい」）。
// 台本は src/data/series/*.json にあり、直した文だけを非公開の books の series/script-edits.json に置いて、読むときに上書きする。
// お客様の本（プレビュー・印刷・しまうまZIP）、トップ・サンプル集の見本の文、絵スタジオの文のすべてに効く。
// Claude が JSON 側に書き写したら、その分はここから消してよい（JSON と同じ文になった分は自動で消える）。

/** 場面の版：main は台本の表の文（その場面の親が出る形）、ほかは alt の写真の組み合わせの文 */
export type ScriptVariant = "main" | Combo;

export type ScriptEdit = {
  /** 文の量（少ない・普通・多い）の順 */
  text: string[];
  /** 直す前の台本の文（あとで JSON に書き写すときの確認用） */
  before: string[];
  updatedAt: string;
};

/** キーは「series/話/場面(1〜12)/版」 */
export type ScriptEdits = Record<string, ScriptEdit>;

const EDITS_PATH = "series/script-edits.json";
export const SCRIPT_TEXT_MAX = 600;

export function scriptEditKey(id: SeriesId, episode: number, scene: number, variant: ScriptVariant) {
  return `${id}/${episode}/${scene}/${variant}`;
}

/** 写真の組み合わせで実際に使われる版（alt にその組み合わせが無ければ表の文） */
export function variantFor(scene: SeriesSceneData, combo: Combo): ScriptVariant {
  return scene.alt?.[combo] ? combo : "main";
}

// 同じサーバーの中で続けて読むときは、少しのあいだ読み直さない（保存したら消す）
let cache: { at: number; edits: ScriptEdits } | null = null;
const CACHE_MS = 5000;

export async function readScriptEdits(): Promise<ScriptEdits> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.edits;
  const db = getSupabase();
  if (!db) return {};
  const { data, error } = await db.storage.from(BOOK_BUCKET).download(EDITS_PATH);
  let edits: ScriptEdits = {};
  if (!error && data) {
    try {
      const raw = JSON.parse(await data.text());
      if (raw && typeof raw === "object") edits = raw as ScriptEdits;
    } catch {}
  }
  cache = { at: Date.now(), edits };
  return edits;
}

/** 1場面の1つの版の文（3段階）を書き換える。text が null か台本と同じなら、直したものを消して台本の文に戻す */
export async function writeScriptEdit(id: SeriesId, episode: number, scene: number, variant: ScriptVariant, text: string[] | null) {
  const db = getSupabase();
  if (!db) throw new Error("Supabase が未設定です");
  const base = baseVersion(id, episode, scene, variant);
  if (!base) throw new Error("指定が正しくありません");
  cache = null;
  const edits = { ...(await readScriptEdits()) };
  const key = scriptEditKey(id, episode, scene, variant);
  if (!text || text.every((t, i) => t === base.text[i])) delete edits[key];
  else edits[key] = { text, before: base.text, updatedAt: new Date().toISOString() };
  const { error } = await db.storage
    .from(BOOK_BUCKET)
    .upload(EDITS_PATH, JSON.stringify(edits, null, 1), { contentType: "application/json", upsert: true, cacheControl: "0" });
  cache = null;
  if (error) throw new Error(error.message);
}

/** JSON の台本の、その場面・版の文 */
function baseVersion(id: SeriesId, episode: number, scene: number, variant: ScriptVariant) {
  const sc = SERIES_DATA[id]?.episodes.find((e) => e.no === episode)?.scenes[scene - 1];
  if (!sc) return null;
  return variant === "main" ? sc : (sc.alt?.[variant] ?? null);
}

/** 直した文を台本に重ねる（直していなければ元のデータをそのまま返す） */
export function applyScriptEdits(data: SeriesData, edits: ScriptEdits): SeriesData {
  const prefix = `${data.id}/`;
  if (!Object.keys(edits).some((k) => k.startsWith(prefix))) return data;
  const textOf = (no: number, scene: number, variant: ScriptVariant, text: string[]) => {
    const e = edits[scriptEditKey(data.id, no, scene, variant)];
    return e ? text.map((t, i) => e.text[i] ?? t) : text;
  };
  return {
    ...data,
    episodes: data.episodes.map((ep) => ({
      ...ep,
      scenes: ep.scenes.map((sc, i) => ({
        ...sc,
        text: textOf(ep.no, i + 1, "main", sc.text),
        ...(sc.alt && {
          alt: Object.fromEntries(Object.entries(sc.alt).map(([c, v]) => [c, v && { ...v, text: textOf(ep.no, i + 1, c as Combo, v.text) }])),
        }),
      })),
    })),
  };
}

/** 直した文を重ねた台本 */
export async function seriesDataWithEdits(id: SeriesId): Promise<SeriesData> {
  return applyScriptEdits(SERIES_DATA[id], await readScriptEdits());
}
