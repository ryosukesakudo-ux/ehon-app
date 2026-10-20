import "server-only";
import { SERIES_PAGES, seriesImagePath, seriesImageTextPath, type SeriesId } from "./series";
import { SAMPLE_BUCKET, getSupabase } from "./services";

// 見本の保存版（2026-10-20 作道さん「今の13枚一式を保存版として別の場所にとっておく」）。
// 絵スタジオで作り直すと見本の絵は上書きされるので、その時点の表紙＋12場面（文の置き場所の JSON も）を
// samples の series/{id}/saved/ep{n}/{日時}/ にコピーしておき、管理画面の「見本の保存版」で見られるようにする。

/** 保存版のフォルダ。stamp は日本時間の「20261020-2250」の形 */
export function savedDir(id: SeriesId, episode: number, stamp?: string) {
  return `series/${id}/saved/ep${episode}${stamp ? `/${stamp}` : ""}`;
}

/** 保存版の1枚（0 が表紙、1〜12 が場面）。ファイル名は見本と同じ */
export function savedImagePath(id: SeriesId, episode: number, stamp: string, page: number) {
  return `${savedDir(id, episode, stamp)}/${seriesImagePath(id, episode, page).split("/").pop()}`;
}

function jstStamp(d = new Date()) {
  const j = new Date(d.getTime() + 9 * 3600_000).toISOString();
  return `${j.slice(0, 10).replaceAll("-", "")}-${j.slice(11, 19).replaceAll(":", "")}`;
}

/** 「20261020-225012」→「2026/10/20 22:50」 */
export function stampLabel(stamp: string) {
  const m = stamp.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/);
  return m ? `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}` : stamp;
}

/** 今の表紙＋12場面を保存版にコピーする。13枚そろっていないときはエラー */
export async function saveEpisodeSet(id: SeriesId, episode: number): Promise<string> {
  const db = getSupabase();
  if (!db) throw new Error("Supabase が未設定です");
  const bucket = db.storage.from(SAMPLE_BUCKET);
  const dir = seriesImagePath(id, episode, 0).replace(/\/[^/]+$/, "");
  const { data: files } = await bucket.list(dir, { limit: 200 });
  const names = new Set((files ?? []).map((f) => f.name));
  const pages = Array.from({ length: SERIES_PAGES }, (_, p) => p);
  const missing = pages.filter((p) => !names.has(seriesImagePath(id, episode, p).split("/").pop()!));
  if (missing.length) throw new Error(`まだ無い絵があります（${missing.map((p) => (p === 0 ? "表紙" : `場面${p}`)).join("・")}）。13枚そろってから保存できます`);

  const stamp = jstStamp();
  const to = savedDir(id, episode, stamp);
  const paths = pages.flatMap((p) => {
    const img = seriesImagePath(id, episode, p);
    const text = seriesImageTextPath(id, episode, p);
    return names.has(text.split("/").pop()!) ? [img, text] : [img];
  });
  for (const from of paths) {
    const { error } = await bucket.copy(from, `${to}/${from.split("/").pop()}`);
    if (error) throw new Error(`${from.split("/").pop()} をコピーできませんでした：${error.message}`);
  }
  return stamp;
}

/** その話の保存版（新しい順） */
export async function listSavedSets(id: SeriesId, episode: number): Promise<string[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data } = await db.storage.from(SAMPLE_BUCKET).list(savedDir(id, episode), { limit: 200, sortBy: { column: "name", order: "desc" } });
  // フォルダは id が null で返る
  return (data ?? []).filter((f) => !f.id && /^\d{8}-\d{6}$/.test(f.name)).map((f) => f.name).sort().reverse();
}

/** 保存版ごとの、直してほしい点のメモ（ページ番号 → 文。"all" は一式全体へのメモ）。保存版のフォルダの notes.json */
export type SavedNotes = Record<string, string>;
export const SAVED_NOTE_MAX = 400;

function notesPath(id: SeriesId, episode: number, stamp: string) {
  return `${savedDir(id, episode, stamp)}/notes.json`;
}

export async function readSavedNotes(id: SeriesId, episode: number, stamp: string): Promise<SavedNotes> {
  const db = getSupabase();
  if (!db) return {};
  const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(notesPath(id, episode, stamp));
  if (error || !data) return {};
  try {
    const raw = JSON.parse(await data.text());
    return raw && typeof raw === "object" ? (raw as SavedNotes) : {};
  } catch {
    return {};
  }
}

/** メモを1つ書き換える（空なら消す） */
export async function writeSavedNote(id: SeriesId, episode: number, stamp: string, key: string, text: string) {
  const db = getSupabase();
  if (!db) throw new Error("Supabase が未設定です");
  const notes = await readSavedNotes(id, episode, stamp);
  if (text) notes[key] = text;
  else delete notes[key];
  const { error } = await db.storage
    .from(SAMPLE_BUCKET)
    .upload(notesPath(id, episode, stamp), JSON.stringify(notes), { contentType: "application/json", upsert: true, cacheControl: "0" });
  if (error) throw new Error(error.message);
}
