import { PREVIEW_SCENES, type StoryId, type TasteId } from "./catalog";

// 作例（実在しない家族で描いた見本の絵）。Supabase の公開ストレージ samples に置き、
// トップページ・テイスト選択・お話選択で表示する。まだ無いときは各画面の仮の見た目のまま。

export const SAMPLE_SCENES = PREVIEW_SCENES;
export const SAMPLE_CHILD_NAME = "はると";

export function samplePath(taste: TasteId, story: StoryId, scene: number) {
  return `${taste}/${story}/${String(scene).padStart(2, "0")}.png`;
}

export function sampleUrl(taste: TasteId, story: StoryId, scene: number) {
  return samplePublicUrl(samplePath(taste, story, scene));
}

// 「この写真から → この絵本に」の見本（架空の家族の写真風の画像と、それをもとにした絵）
export const SHOWCASE = { story: "forest" as StoryId, scene: 10, taste: "watercolor" as TasteId };
export const SHOWCASE_PHOTO = "showcase/photo.png";
export const SHOWCASE_BOOK = "showcase/book.png";

export function samplePublicUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/samples/${path}` : null;
}
