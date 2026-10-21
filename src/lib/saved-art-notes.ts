import "server-only";
import { SAVED_NOTES_DONE } from "./saved-notes-done";
import type { SavedNoteRow } from "./series-saved";
import { SAMPLE_BUCKET, getSupabase } from "./services";

// 保存版のメモを、お客様の本の絵の指示にも自動で入れる（2026-10-21 作道さん「メモを保存したら自動で台本にも入る仕組みに」）。
// どのメモを使うか：話・ページ（0 が表紙、1〜12 が場面、all が一式全体）ごとに、いちばん新しく書いたメモ1つ。
// 古い保存版に書いたメモは、新しい保存版に同じページのメモを書くとそちらに置きかわる（メモを消す・保存版を消すと入らなくなる）。
// Claude が台本（series-data）に書き写したメモ（saved-notes-done.ts）は二重にならないよう入れない。
// 一覧は保存版のメモを書くたびに series-saved.ts が更新する samples の series/saved-notes.json。

const NOTES_INDEX_PATH = "series/saved-notes.json";

export type ActiveArtNote = { text: string; stamp: string; updatedAt: string };
/** キーは「series/話/ページ」 */
export type ActiveArtNotes = Record<string, ActiveArtNote>;

const keyOf = (series: string, episode: number, page: string | number) => `${series}/${episode}/${page}`;

// 同じサーバーの中で続けて読むときは、少しのあいだ読み直さない（12場面をまとめて描くときなど）
let cache: { at: number; notes: ActiveArtNotes } | null = null;
const CACHE_MS = 5000;

export async function readActiveArtNotes(): Promise<ActiveArtNotes> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.notes;
  const db = getSupabase();
  if (!db) return {};
  const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(NOTES_INDEX_PATH);
  let rows: SavedNoteRow[] = [];
  if (!error && data) {
    try {
      const raw = JSON.parse(await data.text());
      if (Array.isArray(raw)) rows = raw as SavedNoteRow[];
    } catch {}
  }
  const notes: ActiveArtNotes = {};
  for (const r of rows) {
    if (!r?.text?.trim() || SAVED_NOTES_DONE[`${r.series}/${r.episode}/${r.stamp}/${r.page}`]) continue;
    const k = keyOf(r.series, r.episode, r.page);
    const cur = notes[k];
    // 新しく書いた方を使う（日時が無い古いメモは、保存版の新しい方）
    if (!cur || (r.updatedAt || r.stamp) > (cur.updatedAt || cur.stamp)) notes[k] = { text: r.text.trim(), stamp: r.stamp, updatedAt: r.updatedAt };
  }
  cache = { at: Date.now(), notes };
  return notes;
}

/** そのメモが今お客様の本の絵に入っているか */
export function isActiveArtNote(notes: ActiveArtNotes, series: string, episode: number, stamp: string, page: string | number) {
  return notes[keyOf(series, episode, page)]?.stamp === stamp;
}

/** その話・ページの絵に入れるメモ（一式全体へのメモ → そのページのメモの順）。無ければ空 */
export function artNoteFor(notes: ActiveArtNotes, series: string, episode: number, page: number) {
  return [notes[keyOf(series, episode, "all")]?.text, notes[keyOf(series, episode, page)]?.text].filter(Boolean).join("\n");
}

export async function savedArtNote(series: string, episode: number, page: number) {
  return artNoteFor(await readActiveArtNotes(), series, episode, page);
}

/** 書いたら次に読むときは読み直す（series-saved.ts から呼ぶ） */
export function clearArtNotesCache() {
  cache = null;
}
