import { toFile } from "openai";
import { getStory, getTaste, type StoryId, type TasteId } from "@/lib/catalog";
import { illustrateSample, makeCharacterSheet } from "@/lib/illustrate";
import { characterSheetPath, samplePath } from "@/lib/samples";
import { SAMPLE_BUCKET, getSupabase } from "@/lib/services";

export const maxDuration = 300;

// 作例スタジオから呼ぶ。実在しない家族で見本の絵を1枚作り、公開ストレージに保存する。
// kind=character：お話ごとのキャラクター設定画 / それ以外：設定画をもとにした見本の1場面
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const story = String(body?.story ?? "") as StoryId;
  const s = getStory(story);
  if (!s) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定のため、作例を保存できません" }, { status: 503 });

  const save = async (path: string, b64: string) => {
    const { error } = await db.storage
      .from(SAMPLE_BUCKET)
      .upload(path, Buffer.from(b64, "base64"), { contentType: "image/png", upsert: true, cacheControl: "300" });
    if (error) throw new Error(error.message);
  };

  try {
    if (body?.kind === "character") {
      await save(characterSheetPath(story), await makeCharacterSheet(story));
      return Response.json({ ok: true });
    }

    const taste = String(body?.taste ?? "") as TasteId;
    const scene = Number(body?.scene);
    const quality = body?.quality === "final" ? "final" : "preview";
    if (!getTaste(taste) || !Number.isInteger(scene) || !s.scenes[scene]) {
      return Response.json({ error: "指定が正しくありません" }, { status: 400 });
    }
    const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(characterSheetPath(story));
    if (error || !data) return Response.json({ error: "先にこのお話のキャラクター設定画を作ってください" }, { status: 400 });
    const sheet = await toFile(data, "characters.png", { type: "image/png" });
    await save(samplePath(taste, story, scene), await illustrateSample({ taste, story, sceneIndex: scene, quality, sheet }));
    return Response.json({ ok: true });
  } catch (e) {
    console.error("sample generation failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "作成に失敗しました" }, { status: 500 });
  }
}
