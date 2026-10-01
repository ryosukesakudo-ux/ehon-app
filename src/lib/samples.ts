import { PREVIEW_SCENES, type StoryId, type TasteId } from "./catalog";

// 作例（実在しない家族で描いた見本の絵）。Supabase の公開ストレージ samples に置き、
// トップページ・テイスト選択・お話選択で表示する。まだ無いときは各画面の仮の見た目のまま。

export const SAMPLE_SCENES = PREVIEW_SCENES;
export const SAMPLE_CHILD_NAME = "はると";

export function samplePath(taste: TasteId, story: StoryId, scene: number) {
  return `${taste}/${story}/${String(scene).padStart(2, "0")}.png`;
}

export function sampleUrl(taste: TasteId, story: StoryId, scene: number) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/samples/${samplePath(taste, story, scene)}` : null;
}
