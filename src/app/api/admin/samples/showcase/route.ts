import { toFile } from "openai";
import { illustrateShowcase, makeShowcasePhoto } from "@/lib/illustrate";
import { SHOWCASE, SHOWCASE_BOOK, SHOWCASE_PHOTO } from "@/lib/samples";
import { SAMPLE_BUCKET, getSupabase } from "@/lib/services";

export const maxDuration = 300;

// 作例スタジオの「この写真から → この絵本に」。
// step=photo：架空の家族の写真風の画像を作る / step=book：その画像から絵本の1場面を作る
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const step = body?.step === "book" ? "book" : "photo";
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定のため、見本を保存できません" }, { status: 503 });

  try {
    let b64: string;
    if (step === "photo") {
      b64 = await makeShowcasePhoto();
    } else {
      const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(SHOWCASE_PHOTO);
      if (error || !data) return Response.json({ error: "先に写真風の画像を作ってください" }, { status: 400 });
      const photo = await toFile(data, "photo.png", { type: "image/png" });
      b64 = await illustrateShowcase({ taste: SHOWCASE.taste, story: SHOWCASE.story, sceneIndex: SHOWCASE.scene, photo });
    }
    const { error } = await db.storage
      .from(SAMPLE_BUCKET)
      .upload(step === "photo" ? SHOWCASE_PHOTO : SHOWCASE_BOOK, Buffer.from(b64, "base64"), {
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
