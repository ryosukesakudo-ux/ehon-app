import { toFile } from "openai";
import { illustrateSeries, makeSeriesFamilyPhoto, makeSeriesSheet } from "@/lib/illustrate";
import { characterSheetPath } from "@/lib/samples";
import { seriesFamilyPhotoPath, seriesImagePath, seriesSheetPath } from "@/lib/series";
import { getStudioSeries } from "@/lib/series-studio";
import { SAMPLE_BUCKET, getSupabase } from "@/lib/services";

export const maxDuration = 300;

// 台本の絵スタジオから呼ぶ。作例の家族でシリーズの絵を1枚作り、公開ストレージ（samples）に保存する。
// note：その絵だけに効く追加の指示（日本語でよい）。
// kind=sheet：シリーズの設定画（作例の設定画＋相棒） / kind=photo：サンプル集に出す、設定画の家族そっくりの架空の家族写真 / それ以外：その話の表紙（page=0）か場面（1〜12）
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const series = getStudioSeries(String(body?.series ?? ""));
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

  const note = typeof body?.note === "string" ? body.note.trim() : "";

  try {
    if (body?.kind === "sheet") {
      // 作例スタジオに家族の設定画があるお話はそれに相棒を足す。無いシリーズ（海・恐竜）は文章から描く
      const family = series.familyStory ? await load(characterSheetPath(series.familyStory), "family.png") : null;
      if (series.familyStory && !family) return Response.json({ error: "先に作例スタジオで、このお話のキャラクター設定画を作ってください" }, { status: 400 });
      await save(seriesSheetPath(series.id), await makeSeriesSheet(series, family, note));
      return Response.json({ ok: true });
    }

    if (body?.kind === "photo") {
      const sheet = await load(seriesSheetPath(series.id), "characters.png");
      if (!sheet) return Response.json({ error: "先に登場人物の設定画を作ってください" }, { status: 400 });
      await save(seriesFamilyPhotoPath(series.id), await makeSeriesFamilyPhoto(sheet, note));
      return Response.json({ ok: true });
    }

    const episode = series.episodes.find((e) => e.no === Number(body?.episode));
    const page = Number(body?.page);
    const scene = !episode || !Number.isInteger(page) ? null : page === 0 ? episode.cover : episode.scenes[page - 1];
    if (!episode || !scene) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
    const sheet = await load(seriesSheetPath(series.id), "characters.png");
    if (!sheet) return Response.json({ error: "先に登場人物の設定画を作ってください" }, { status: 400 });
    const quality = body?.quality === "preview" ? "preview" : "final";
    await save(
      seriesImagePath(series.id, episode.no, page),
      await illustrateSeries({ series, scene, page, outfits: episode.outfits, continuity: episode.continuity, note, quality, sheet }),
    );
    return Response.json({ ok: true });
  } catch (e) {
    console.error("series generation failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "作成に失敗しました" }, { status: 500 });
  }
}
