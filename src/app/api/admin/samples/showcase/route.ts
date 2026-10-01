import { toFile } from "openai";
import { illustrateShowcase, makeHeroBookPhoto, makeShowcasePhoto } from "@/lib/illustrate";
import { getStory } from "@/lib/catalog";
import { HERO_BOOK_PHOTO, SAMPLE_CHILD_NAME, SHOWCASE, SHOWCASE_BOOK, SHOWCASE_PHOTO, samplePath } from "@/lib/samples";
import { SAMPLE_BUCKET, getSupabase } from "@/lib/services";

export const maxDuration = 300;

// 作例スタジオの「この写真から → この絵本に」。
// step=photo：架空の家族の写真風の画像を作る / step=book：その画像から絵本の1場面を作る
// step=hero：トップの一番上に出す、完成した絵本の商品写真風の画像を作る
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const step: "photo" | "book" | "hero" = body?.step === "book" || body?.step === "hero" ? body.step : "photo";
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定のため、見本を保存できません" }, { status: 503 });

  try {
    let b64: string;
    if (step === "photo") {
      b64 = await makeShowcasePhoto();
    } else if (step === "hero") {
      const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(samplePath(SHOWCASE.taste, SHOWCASE.story, 0));
      if (error || !data) return Response.json({ error: "先に「もりのだいぼうけん」の水彩の見本（1枚目）を作ってください" }, { status: 400 });
      const cover = await toFile(data, "cover.png", { type: "image/png" });
      b64 = await makeHeroBookPhoto({ title: `${SAMPLE_CHILD_NAME}と ${getStory(SHOWCASE.story)!.name}`, cover });
    } else {
      const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(SHOWCASE_PHOTO);
      if (error || !data) return Response.json({ error: "先に写真風の画像を作ってください" }, { status: 400 });
      const photo = await toFile(data, "photo.png", { type: "image/png" });
      b64 = await illustrateShowcase({ taste: SHOWCASE.taste, story: SHOWCASE.story, sceneIndex: SHOWCASE.scene, photo });
    }
    const { error } = await db.storage
      .from(SAMPLE_BUCKET)
      .upload({ photo: SHOWCASE_PHOTO, book: SHOWCASE_BOOK, hero: HERO_BOOK_PHOTO }[step], Buffer.from(b64, "base64"), {
        contentType: "image/png",
        upsert: true,
        cacheControl: "300",
      });
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("showcase generation failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "作成に失敗しました" }, { status: 500 });
  }
}
