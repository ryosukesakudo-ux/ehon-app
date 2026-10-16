import "server-only";
import { PROOFREAD_EPISODES, SERIES_LIST, type SeriesId } from "./story-key";
import { SAMPLE_BUCKET, getSupabase } from "./services";

// 本番に出す（お客様が注文できる）話。2026-10-16 作道さん：絵スタジオで見本の絵を見て、良ければ管理画面のボタンで本番に載せる。
// 以前はコードの PROOFREAD_EPISODES を書き換えていた。ボタンで変えた内容は samples の series/published.json に保存し、
// まだ一度も変えていないときは PROOFREAD_EPISODES を使う。
const PUBLISHED_PATH = "series/published.json";

export type Published = Record<SeriesId, number[]>;

function normalize(raw: unknown): Published {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(
    SERIES_LIST.map((s) => {
      const list = Array.isArray(src[s.id]) ? (src[s.id] as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 1) : [];
      return [s.id, [...new Set(list)].sort((a, b) => a - b)];
    }),
  ) as Published;
}

export async function publishedEpisodes(): Promise<Published> {
  const db = getSupabase();
  if (!db) return normalize(PROOFREAD_EPISODES);
  const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(PUBLISHED_PATH);
  if (error || !data) return normalize(PROOFREAD_EPISODES);
  try {
    return normalize(JSON.parse(await data.text()));
  } catch {
    return normalize(PROOFREAD_EPISODES);
  }
}

export async function isPublished(id: SeriesId, no: number) {
  return (await publishedEpisodes())[id].includes(no);
}

/** 本番に出す・取り下げる。変えたあとの一覧を返す */
export async function setPublished(id: SeriesId, no: number, on: boolean): Promise<Published> {
  const db = getSupabase();
  if (!db) throw new Error("Supabase が未設定です");
  const now = await publishedEpisodes();
  now[id] = on ? [...new Set([...now[id], no])].sort((a, b) => a - b) : now[id].filter((n) => n !== no);
  const { error } = await db.storage
    .from(SAMPLE_BUCKET)
    .upload(PUBLISHED_PATH, JSON.stringify(now), { contentType: "application/json", upsert: true, cacheControl: "0" });
  if (error) throw new Error(error.message);
  return now;
}
