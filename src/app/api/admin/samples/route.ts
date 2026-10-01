import { getStory, getTaste, type StoryId, type TasteId } from "@/lib/catalog";
import { illustrateSample } from "@/lib/illustrate";
import { samplePath } from "@/lib/samples";
import { SAMPLE_BUCKET, getSupabase } from "@/lib/services";

export const maxDuration = 300;

// 作例スタジオから呼ぶ。実在しない家族で見本の絵を1枚作り、公開ストレージに保存する。
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const taste = String(body?.taste ?? "") as TasteId;
  const story = String(body?.story ?? "") as StoryId;
  const scene = Number(body?.scene);
  const quality = body?.quality === "final" ? "final" : "preview";
  const s = getStory(story);
  if (!getTaste(taste) || !s || !Number.isInteger(scene) || !s.scenes[scene]) {
    return Response.json({ error: "指定が正しくありません" }, { status: 400 });
  }
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定のため、作例を保存できません" }, { status: 503 });

  try {
    const b64 = await illustrateSample({ taste, story, sceneIndex: scene, quality });
    const { error } = await db.storage
      .from(SAMPLE_BUCKET)
      .upload(samplePath(taste, story, scene), Buffer.from(b64, "base64"), {
        contentType: "image/png",
        upsert: true,
        cacheControl: "300",
      });
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("sample generation failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "作成に失敗しました" }, { status: 500 });
  }
}
