import "server-only";
import type { StoryId } from "./catalog";
import { SERIES_DATA } from "./series-data";
import { SERIES_PAGES, seriesImagePath, type SeriesScene } from "./series";
import { SERIES_LIST, openEpisodes, type SeriesId } from "./story-key";
import { SAMPLE_BUCKET, getSupabase } from "./services";

// 絵スタジオで描く見本の場面。見本の家族はママもパパもいるので、両方の写真がある形（alt.both）があればそちらを使う。

export type StudioEpisode = { no: number; title: string; outfits?: string; cover: SeriesScene; scenes: SeriesScene[] };

export type StudioSeries = {
  id: SeriesId;
  name: string;
  /** 作例スタジオの家族の設定画があるお話（その設定画に相棒を足してシリーズの設定画にする）。無ければ文章から作る */
  familyStory: StoryId | null;
  sidekick: string;
  sidekickLabel: string;
  cast: Record<string, string>;
  episodes: StudioEpisode[];
};

const FAMILY_STORY: Partial<Record<SeriesId, StoryId>> = { forest: "forest", star: "star", birthday: "birthday" };

export function getStudioSeries(id: string): StudioSeries | null {
  const data = SERIES_DATA[id as SeriesId];
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    familyStory: FAMILY_STORY[data.id] ?? null,
    sidekick: data.sidekick,
    sidekickLabel: data.sidekickLabel,
    cast: data.cast,
    episodes: openEpisodes(data.episodes).map((ep) => ({
      no: ep.no,
      title: ep.title,
      outfits: ep.outfits ?? undefined,
      cover: ep.cover,
      scenes: ep.scenes.map((s) => {
        const v = s.alt?.both ?? s;
        return { label: v.label, art: v.art, withMom: v.withMom, withDad: v.withDad, withSidekick: v.withSidekick, camera: v.camera ?? s.camera };
      }),
    })),
  };
}

/** 見本の絵（表紙＋12場面）がそろっている話。お客様が選べるのはこの話だけ */
export async function readyEpisodes(): Promise<Record<SeriesId, number[]>> {
  const out = Object.fromEntries(SERIES_LIST.map((s) => [s.id, [] as number[]])) as Record<SeriesId, number[]>;
  const db = getSupabase();
  // デモモード（Supabase 未設定）では、すべての話を選べるようにする（画面の確認用）
  if (!db) return Object.fromEntries(SERIES_LIST.map((s) => [s.id, openEpisodes(s.episodes).map((e) => e.no)])) as Record<SeriesId, number[]>;
  await Promise.all(
    SERIES_LIST.flatMap((s) =>
      openEpisodes(s.episodes).map(async (ep) => {
        const dir = seriesImagePath(s.id, ep.no, 0).replace(/\/[^/]+$/, "");
        const { data } = await db.storage.from(SAMPLE_BUCKET).list(dir, { limit: 100 });
        const names = new Set((data ?? []).map((f) => f.name));
        const ok = Array.from({ length: SERIES_PAGES }, (_, p) => seriesImagePath(s.id, ep.no, p).split("/").pop()!).every((n) => names.has(n));
        if (ok) out[s.id].push(ep.no);
      }),
    ),
  );
  for (const id of Object.keys(out) as SeriesId[]) out[id].sort((a, b) => a - b);
  return out;
}
