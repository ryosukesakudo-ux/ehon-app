import { toFile } from "openai";
import { illustrateSeries, makeSeriesFamilyPhoto, makeSeriesFamilyPhotoFromText, makeSeriesSheet } from "@/lib/illustrate";
import { characterSheetPath } from "@/lib/samples";
import { seriesFamilyPhotoPath, seriesImagePath, seriesSheetPath, seriesSpreadPath, seriesSpreadTextPath, usesShowcasePhoto } from "@/lib/series";
import { findSpreadTextSpot } from "@/lib/spread-text";
import { getStudioSeries } from "@/lib/series-studio";
import { SAMPLE_BUCKET, getSupabase } from "@/lib/services";

export const maxDuration = 300;

// 台本の絵スタジオから呼ぶ。作例の家族でシリーズの絵を1枚作り、公開ストレージ（samples）に保存する。
// note：その絵だけに効く追加の指示（日本語でよい）。
// kind=sheet：シリーズの設定画（作例の設定画＋相棒） / kind=photo：サンプル集に出す、設定画の家族そっくりの架空の家族写真
// （写真が先のシリーズは逆：photo を文章から先に作り、sheet と場面はその写真に寄せる） / それ以外：その話の表紙（page=0）か場面（1〜12）
// spread=true：場面を見開き（横長）で描く試作。今の場面の絵とは別の場所に保存する。textSide のページを空けて描き、
// できた絵をAIが見て文の置き場所（人物・動物のいない所）を決めて、隣にJSONで保存する
// kind=spreadText：今ある見開きの絵で、文の置き場所だけ選び直す
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

  const saveSpot = async (episode: number, page: number, png: Buffer, side: "left" | "right") => {
    const spot = await findSpreadTextSpot(png, side);
    const { error } = await db.storage
      .from(SAMPLE_BUCKET)
      .upload(seriesSpreadTextPath(series.id, episode, page), JSON.stringify({ spot }), { contentType: "application/json", upsert: true, cacheControl: "300" });
    if (error) throw new Error(error.message);
  };
  const textSide = body?.textSide === "left" ? "left" : "right";

  const note = typeof body?.note === "string" ? body.note.trim() : "";
  const noPhoto = usesShowcasePhoto(series.id) ? "先に作例スタジオで「この写真から → この絵本に」の①（家族の写真）を作ってください" : "先に家族写真を作ってください";

  try {
    if (body?.kind === "photo" && usesShowcasePhoto(series.id)) {
      // トップの写真と共用（作例スタジオで作る）。ここで作るとトップの写真まで変わってしまう
      return Response.json({ error: "このシリーズの家族写真は、作例スタジオの「この写真から → この絵本に」①を使います。作り直すときは作例スタジオで作ってください" }, { status: 400 });
    }

    if (series.photoFirst && body?.kind === "photo") {
      // 写真が先のシリーズ：家族写真を文章から作る（設定画と場面はこの写真に寄せる）
      await save(seriesFamilyPhotoPath(series.id), await makeSeriesFamilyPhotoFromText(series, note));
      return Response.json({ ok: true });
    }

    if (series.photoFirst && body?.kind === "sheet") {
      const photo = await load(seriesFamilyPhotoPath(series.id), "family-photo.png");
      if (!photo) return Response.json({ error: noPhoto }, { status: 400 });
      await save(seriesSheetPath(series.id), await makeSeriesSheet(series, null, note, photo));
      return Response.json({ ok: true });
    }

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

    if (body?.kind === "spreadText") {
      if (!episode || !Number.isInteger(page) || page < 1) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
      const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(seriesSpreadPath(series.id, episode.no, page));
      if (error || !data) return Response.json({ error: "先に見開きの絵を作ってください" }, { status: 400 });
      await saveSpot(episode.no, page, Buffer.from(await data.arrayBuffer()), textSide);
      return Response.json({ ok: true });
    }

    const scene = !episode || !Number.isInteger(page) ? null : page === 0 ? episode.cover : episode.scenes[page - 1];
    if (!episode || !scene) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
    const sheet = await load(seriesSheetPath(series.id), "characters.png");
    if (!sheet) return Response.json({ error: "先に登場人物の設定画を作ってください" }, { status: 400 });
    const photo = series.photoFirst ? await load(seriesFamilyPhotoPath(series.id), "family-photo.png") : null;
    if (series.photoFirst && !photo) return Response.json({ error: noPhoto }, { status: 400 });
    const quality = body?.quality === "preview" ? "preview" : "final";
    const spread = body?.spread === true;
    if (spread && page === 0) return Response.json({ error: "見開きの試作は場面（1〜12）だけです" }, { status: 400 });
    const b64 = await illustrateSeries({ series, scene, page, outfits: episode.outfits, continuity: episode.continuity, note, quality, sheet, photo, spread, textSide });
    await save(spread ? seriesSpreadPath(series.id, episode.no, page) : seriesImagePath(series.id, episode.no, page), b64);
    if (spread) await saveSpot(episode.no, page, Buffer.from(b64, "base64"), textSide);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("series generation failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "作成に失敗しました" }, { status: 500 });
  }
}
