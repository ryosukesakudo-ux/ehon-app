import "server-only";
import type { StoryId } from "./catalog";
import { SERIES_DATA, type Continuity } from "./series-data";
import { SERIES_PAGES, isPhotoFirst, seriesImagePath, type SeriesScene } from "./series";
import { SERIES_LIST, isOpenSeries, openEpisodes, type Combo, type SeriesId } from "./story-key";
import { SAMPLE_BUCKET, getSupabase } from "./services";

// 絵スタジオで描く見本の場面。見本の家族はママもパパもいるので、両方の写真がある形（alt.both）があればそちらを使う。

export type StudioEpisode = { no: number; title: string; outfits?: string; continuity: Continuity[]; cover: SeriesScene; scenes: SeriesScene[] };

export type StudioSeries = {
  id: SeriesId;
  name: string;
  /** 作例スタジオの家族の設定画があるお話（その設定画に相棒を足してシリーズの設定画にする）。無ければ文章から作る */
  familyStory: StoryId | null;
  /** 家族写真が先（設定画・場面は写真に寄せて描く） */
  photoFirst: boolean;
  sidekick: string;
  sidekickLabel: string;
  cast: Record<string, string>;
  props: Record<string, string>;
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
    photoFirst: isPhotoFirst(data.id),
    sidekick: data.sidekick,
    sidekickLabel: data.sidekickLabel,
    cast: data.cast,
    props: data.props ?? {},
    episodes: openEpisodes(data.episodes).map((ep) => ({
      no: ep.no,
      title: ep.title,
      outfits: ep.outfits ?? undefined,
      continuity: ep.continuity ?? [],
      cover: ep.cover,
      scenes: ep.scenes.map((s) => {
        const v = s.alt?.both ?? s;
        return { label: v.label, art: v.art, withMom: v.withMom, withDad: v.withDad, withSidekick: v.withSidekick, camera: v.camera ?? s.camera, counts: s.counts };
      }),
    })),
  };
}

/** その話の見本の絵（表紙＋12場面）がそろっているか */
export async function episodeArtComplete(id: SeriesId, no: number) {
  const db = getSupabase();
  if (!db) return true;
  const dir = seriesImagePath(id, no, 0).replace(/\/[^/]+$/, "");
  const { data } = await db.storage.from(SAMPLE_BUCKET).list(dir, { limit: 100 });
  const names = new Set((data ?? []).map((f) => f.name));
  return Array.from({ length: SERIES_PAGES }, (_, p) => seriesImagePath(id, no, p).split("/").pop()!).every((n) => names.has(n));
}

/** 見本の絵（表紙＋12場面）がそろっている話。お客様が選べるのはこの話だけ（公開中のシリーズに限る） */
export async function readyEpisodes(): Promise<Record<SeriesId, number[]>> {
  const out = Object.fromEntries(SERIES_LIST.map((s) => [s.id, [] as number[]])) as Record<SeriesId, number[]>;
  const db = getSupabase();
  // デモモード（Supabase 未設定）では、すべての話を選べるようにする（画面の確認用）
  if (!db) return Object.fromEntries(SERIES_LIST.map((s) => [s.id, isOpenSeries(s.id) ? openEpisodes(s.episodes).map((e) => e.no) : []])) as Record<SeriesId, number[]>;
  await Promise.all(
    SERIES_LIST.filter((s) => isOpenSeries(s.id)).flatMap((s) =>
      openEpisodes(s.episodes).map(async (ep) => {
        if (await episodeArtComplete(s.id, ep.no)) out[s.id].push(ep.no);
      }),
    ),
  );
  for (const id of Object.keys(out) as SeriesId[]) out[id].sort((a, b) => a - b);
  return out;
}

/** 写真の組み合わせに合わせた、その話の12場面（見開き版の本の試作用）。違う組み合わせの文と絵は台本の alt にある */
export function studioScenesFor(id: SeriesId, episode: number, combo: Combo): SeriesScene[] | null {
  const ep = SERIES_DATA[id]?.episodes.find((e) => e.no === episode);
  if (!ep) return null;
  return ep.scenes.map((s) => {
    const v = s.alt?.[combo] ?? s;
    return { label: v.label, art: v.art, withMom: v.withMom, withDad: v.withDad, withSidekick: v.withSidekick, camera: v.camera ?? s.camera, counts: s.counts };
  });
}
