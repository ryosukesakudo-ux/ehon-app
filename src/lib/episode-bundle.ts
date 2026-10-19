import "server-only";
import { randomUUID } from "node:crypto";
import type { Draft } from "./drafts";
import { publishedEpisodes } from "./published-episodes";
import { readyEpisodes } from "./series-studio";
import { getSupabase } from "./services";
import { copyFamily } from "./stand-ins";
import { copySiblings } from "./siblings";
import { fixedLevelEpisode, openEpisodes, getSeriesInfo, parseSeriesKey, seriesKey } from "./story-key";

// シリーズの話をまとめて買う（2026-10-16 作道さん）。
// 作成の流れでは1話だけ作り、注文の前に「2話目以降もつくりますか？」で同じシリーズの話を選べる。
// 1話＝1冊（36ページ）。選んだ話ごとに、主人公・写真・キャラクター・テイスト・文の量が同じ下書きを作る（キャラクターの絵はそのまま共用）。
// 注文は話ごとに1件ずつ作り、2話目以降の注文は bundle_of に1話目の注文を入れる（支払いは1回・同じ箱でお届け）。
// プレビューは選択制。見なかった話の絵は、支払いのあと管理画面で作り、確認してから印刷する。

/** その下書きと一緒に買える話（同じシリーズで、本番に出ていて見本の絵がそろった話。その下書きの話は除く） */
export async function extraEpisodeChoices(story: string): Promise<number[]> {
  const k = parseSeriesKey(story);
  if (!k) return [];
  const [published, art] = await Promise.all([publishedEpisodes(), readyEpisodes()]);
  const info = getSeriesInfo(k.series);
  return openEpisodes(info?.episodes ?? [])
    .map((e) => e.no)
    .filter((no) => no !== k.episode && published[k.series].includes(no) && art[k.series].includes(no));
}

/** 下書きの話を別の話に変えたお話の番号（文の量が話ごとに決まっている話は、その文の量） */
export function episodeStoryKey(story: string, episode: number) {
  const k = parseSeriesKey(story);
  if (!k) return null;
  const level = fixedLevelEpisode(k.series, episode)?.level ?? k.level;
  return seriesKey(k.series, episode, level, k.combo, k.siblings);
}

/**
 * 別の話の下書きを用意する。同じ持ち主・同じ元の下書きから作った、その話の下書きが渡されればそれを使う（プレビューを作った下書き）。
 * 無ければ元の下書きを写して新しく作る
 */
export async function draftForEpisode(base: Draft, episode: number, existingId?: string | null): Promise<Draft | null> {
  const db = getSupabase();
  const story = episodeStoryKey(base.story, episode);
  if (!db || !story || !base.user_id) return null;
  if (existingId) {
    const { data } = await db.from("drafts").select("*").eq("id", existingId).maybeSingle();
    const d = data as Draft | null;
    if (d && d.user_id === base.user_id && d.story === story && d.child_name === base.child_name && d.taste === base.taste && !d.images_deleted_at) return d;
  }
  const row = {
    id: randomUUID(),
    user_id: base.user_id,
    anon_id: null,
    taste: base.taste,
    story,
    child_name: base.child_name,
    child_age: base.child_age,
    child_photo_path: base.child_photo_path,
    mom_photo_path: base.mom_photo_path,
    dad_photo_path: base.dad_photo_path,
    child_character_path: base.child_character_path ?? null,
    mom_character_path: base.mom_character_path ?? null,
    dad_character_path: base.dad_character_path ?? null,
    plain_face: base.plain_face ?? false,
  };
  let { data, error } = await db.from("drafts").insert(row).select("*").single();
  if (error?.code === "PGRST204" || error?.code === "42703") {
    // 顔の飾りの列が無いデータベース
    const withoutPlain: Partial<typeof row> = { ...row };
    delete withoutPlain.plain_face;
    ({ data, error } = await db.from("drafts").insert(withoutPlain).select("*").single());
  }
  if (error) {
    console.error("episode draft insert failed", error);
    return null;
  }
  // ママ・パパの欄を兄弟姉妹に入れ替えていれば、ほかの話にも同じ入れ替えを写す
  await copyFamily(db, base.id, (data as Draft).id).catch((e) => console.error("episode family copy failed", e));
  // 足した兄弟姉妹も写し、その話の文を書き直す
  await copySiblings(db, base.id, (data as Draft).id, story).catch((e) => console.error("episode siblings copy failed", e));
  return data as Draft;
}
