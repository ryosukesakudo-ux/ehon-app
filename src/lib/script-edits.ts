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

// --- 作り込み中のシリーズ（ヒーロー・プリンセス）は、台本まるごとを管理画面で直す（2026-10-23 作道さん「作り込みやすいよう構造化して」）---
// 本文だけでなく、場面の絵の説明・服の形と色・登場人物・タッチも直せる。直した台本まるごとを books の series/structured/{id}.json に置き、
// readScriptEdits() で読んだ文の直しと一緒に、applyScriptEdits() で台本に重ねる（お客様の本・絵スタジオ・サンプル集のすべてに効く）。
/** 台本まるごとを管理画面で直せるシリーズ */
export const STRUCTURED_SERIES: SeriesId[] = ["hero", "princess"];

export function isStructured(id: SeriesId) {
  return STRUCTURED_SERIES.includes(id);
}

const structuredPath = (id: SeriesId) => `series/structured/${id}.json`;

export type StructuredEdit = { data: SeriesData; updatedAt: string };

/** 読んだ文の直し（ScriptEdits）に、そのとき読んだ台本まるごとの直しをひもづける（型を変えずに、edits を渡す所すべてに効かせるため） */
const structuredOf = new WeakMap<ScriptEdits, Partial<Record<SeriesId, StructuredEdit>>>();

// 同じサーバーの中で続けて読むときは、少しのあいだ読み直さない（保存したら消す）
let cache: { at: number; edits: ScriptEdits } | null = null;
const CACHE_MS = 5000;

export async function readScriptEdits(): Promise<ScriptEdits> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.edits;
  const db = getSupabase();
  if (!db) return {};
  const [main, ...structured] = await Promise.all([
    db.storage.from(BOOK_BUCKET).download(EDITS_PATH),
    ...STRUCTURED_SERIES.map((id) => db.storage.from(BOOK_BUCKET).download(structuredPath(id))),
  ]);
  let edits: ScriptEdits = {};
  if (!main.error && main.data) {
    try {
      const raw = JSON.parse(await main.data.text());
      if (raw && typeof raw === "object") edits = raw as ScriptEdits;
    } catch {}
  }
  const overrides: Partial<Record<SeriesId, StructuredEdit>> = {};
  await Promise.all(
    structured.map(async (r, i) => {
      if (r.error || !r.data) return;
      try {
        const raw = JSON.parse(await r.data.text());
        const id = STRUCTURED_SERIES[i];
        if (raw?.data?.id === id && Array.isArray(raw.data.episodes)) overrides[id] = raw as StructuredEdit;
      } catch {}
    }),
  );
  structuredOf.set(edits, overrides);
  cache = { at: Date.now(), edits };
  return edits;
}

/** 管理画面で直した台本まるごと（直していなければ null） */
export async function readStructuredEdit(id: SeriesId): Promise<StructuredEdit | null> {
  return structuredOf.get(await readScriptEdits())?.[id] ?? null;
}

/** 台本まるごとを保存する。null なら直したものを消して、元の台本（JSON）に戻す */
export async function writeStructuredEdit(id: SeriesId, data: SeriesData | null) {
  const db = getSupabase();
  if (!db) throw new Error("Supabase が未設定です");
  cache = null;
  const path = structuredPath(id);
  const { error } = data
    ? await db.storage
        .from(BOOK_BUCKET)
        .upload(path, JSON.stringify({ data, updatedAt: new Date().toISOString() } satisfies StructuredEdit, null, 1), { contentType: "application/json", upsert: true, cacheControl: "0" })
    : await db.storage.from(BOOK_BUCKET).remove([path]);
  cache = null;
  if (error) throw new Error(error.message);
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
  // 台本まるごとを直したシリーズは、直した台本がそのまま正（文も中に入っている）
  const structured = structuredOf.get(edits)?.[data.id];
  if (structured) return structured.data;
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
