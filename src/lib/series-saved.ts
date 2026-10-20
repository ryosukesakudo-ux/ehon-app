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

/**
 * 保存版ごとの、直してほしい点のメモ（ページ番号 → メモ。"all" は一式全体へのメモ）。保存版のフォルダの notes.json。
 * 2026-10-20 作道さん「そこで指示したり修正したことが本番にも反映されるように」→ 両方に反映する：
 * ・見本：メモを指示にして、今の見本のその1枚を作り直す（redrawnAt に日時を残す）
 * ・お客様の本：Claude がメモ（管理画面の「コピー」か、公開の一覧 series/saved-notes.json）を読んで台本・絵の指示に入れ、
 *   入れたメモは saved-notes-done.ts に書く（画面に「台本に反映済み」と出る）
 */
export type SavedNote = { text: string; updatedAt: string; redrawnAt?: string };
export type SavedNotes = Record<string, SavedNote>;
export const SAVED_NOTE_MAX = 400;
/** すべての保存版のメモをまとめた一覧（Claude が読んで台本に反映するため） */
const NOTES_INDEX_PATH = "series/saved-notes.json";
export type SavedNoteRow = SavedNote & { series: SeriesId; episode: number; stamp: string; page: string };

function notesPath(id: SeriesId, episode: number, stamp: string) {
  return `${savedDir(id, episode, stamp)}/notes.json`;
}

async function readJson(path: string): Promise<unknown> {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(path);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text());
  } catch {
    return null;
  }
}

async function writeJson(path: string, value: unknown) {
  const db = getSupabase();
  if (!db) throw new Error("Supabase が未設定です");
  const { error } = await db.storage.from(SAMPLE_BUCKET).upload(path, JSON.stringify(value, null, 1), { contentType: "application/json", upsert: true, cacheControl: "0" });
  if (error) throw new Error(error.message);
}

export async function readSavedNotes(id: SeriesId, episode: number, stamp: string): Promise<SavedNotes> {
  const raw = await readJson(notesPath(id, episode, stamp));
  if (!raw || typeof raw !== "object") return {};
  const out: SavedNotes = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = { text: v, updatedAt: "" };
    else if (v && typeof v === "object" && typeof (v as SavedNote).text === "string") out[k] = v as SavedNote;
  }
  return out;
}

/** メモを1つ書き換える（空なら消す）。redrawn=true のときは文はそのままで「作り直した」日時だけ残す */
export async function writeSavedNote(id: SeriesId, episode: number, stamp: string, key: string, change: { text: string } | { redrawn: true }) {
  const notes = await readSavedNotes(id, episode, stamp);
  const now = new Date().toISOString();
  if ("redrawn" in change) {
    if (notes[key]) notes[key] = { ...notes[key], redrawnAt: now };
  } else if (change.text) {
    notes[key] = notes[key]?.text === change.text ? notes[key] : { text: change.text, updatedAt: now };
  } else delete notes[key];
  await writeJson(notesPath(id, episode, stamp), notes);

  // まとめの一覧も書き換える
  const rawIndex = await readJson(NOTES_INDEX_PATH);
  const index = (Array.isArray(rawIndex) ? rawIndex : []) as SavedNoteRow[];
  const rest = index.filter((r) => !(r.series === id && r.episode === episode && r.stamp === stamp && r.page === key));
  const row = notes[key];
  await writeJson(NOTES_INDEX_PATH, row ? [...rest, { series: id, episode, stamp, page: key, ...row }] : rest);
}
