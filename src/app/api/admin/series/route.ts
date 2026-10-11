import { toFile } from "openai";
import { illustrateSeries, makeSeriesSheet } from "@/lib/illustrate";
import { characterSheetPath } from "@/lib/samples";
import { getEpisode, getSeries, seriesImagePath, seriesSheetPath, type SeriesId } from "@/lib/series";
import { SAMPLE_BUCKET, getSupabase } from "@/lib/services";

export const maxDuration = 300;

// 台本の絵スタジオから呼ぶ。作例の家族でシリーズの絵を1枚作り、公開ストレージ（samples）に保存する。
// kind=sheet：シリーズの設定画（作例の設定画＋相棒） / それ以外：その話の表紙（page=0）か場面（1〜12）
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const id = String(body?.series ?? "") as SeriesId;
  const series = getSeries(id);
  if (!series) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定のため、絵を保存できません" }, { status: 503 });

  const load = async (path: string, name: string) => {
    const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(path);
    return error || !data ? null : toFile(data, name, { type: "image/png" });
  };
  const save = async (path: string, b64: string) => {
    const { error } = await db.storage
      .from(SAMPLE_BUCKET)
      .upload(path, Buffer.from(b64, "base64"), { contentType: "image/png", upsert: true, cacheControl: "300" });
    if (error) throw new Error(error.message);
  };

  try {
    if (body?.kind === "sheet") {
      const family = await load(characterSheetPath(series.story), "family.png");
      if (!family) return Response.json({ error: "先に作例スタジオで、このお話のキャラクター設定画を作ってください" }, { status: 400 });
      await save(seriesSheetPath(id), await makeSeriesSheet(id, family));
      return Response.json({ ok: true });
    }

    const episode = getEpisode(id, Number(body?.episode));
    const page = Number(body?.page);
    const scene = !episode || !Number.isInteger(page) ? null : page === 0 ? episode.cover : episode.scenes[page - 1];
    if (!episode || !scene) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
    const sheet = await load(seriesSheetPath(id), "characters.png");
    if (!sheet) return Response.json({ error: "先に登場人物の設定画を作ってください" }, { status: 400 });
    const quality = body?.quality === "preview" ? "preview" : "final";
    await save(
      seriesImagePath(id, episode.no, page),
      await illustrateSeries({ id, scene, cover: page === 0, outfits: episode.outfits, quality, sheet }),
    );
    return Response.json({ ok: true });
  } catch (e) {
    console.error("series generation failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "作成に失敗しました" }, { status: 500 });
  }
}
