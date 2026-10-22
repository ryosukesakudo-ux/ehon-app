import { toFile } from "openai";
import { illustrateTouch } from "@/lib/illustrate";
import { SHOWCASE_PHOTO } from "@/lib/samples";
import { getStudioSeries } from "@/lib/series-studio";
import { SAMPLE_BUCKET, getSupabase } from "@/lib/services";
import { getTouch, touchImagePath } from "@/lib/touch";
import { toJpegB64 } from "@/lib/upscale";

export const maxDuration = 300;

// タッチ試作：作例の家族写真（トップの①）から、森1話の1場面を手描き風タッチで1枚描く。
// タッチごとに最後の1枚だけ samples の trial/touch/ に残す（見比べ用。お客様の画面には出ない）。
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const touch = getTouch(String(body?.touch ?? ""));
  if (!touch) return Response.json({ error: "タッチを選んでください" }, { status: 400 });
  const page = Number(body?.scene);
  const series = getStudioSeries("forest");
  const episode = series?.episodes.find((e) => e.no === 1);
  const scene = episode?.scenes[page - 1];
  if (!series || !episode || !scene) return Response.json({ error: "場面が見つかりません" }, { status: 400 });
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定のため、家族写真を読み込めません" }, { status: 503 });
  const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(SHOWCASE_PHOTO);
  if (error || !data) return Response.json({ error: "先に作例スタジオで「この写真から」①（家族の写真）を作ってください" }, { status: 400 });

  try {
    const started = Date.now();
    const b64 = await illustrateTouch({ touch, series, scene, outfits: episode.outfits, photo: await toFile(data, "photo.png", { type: "image/png" }), note });
    const seconds = Math.round((Date.now() - started) / 1000);
    const { error: saveError } = await db.storage
      .from(SAMPLE_BUCKET)
      .upload(touchImagePath(touch.id), Buffer.from(b64, "base64"), { contentType: "image/png", upsert: true, cacheControl: "60" });
    if (saveError) console.error("touch save failed", saveError);
    return Response.json({ image: `data:image/jpeg;base64,${await toJpegB64(b64)}`, seconds });
  } catch (e) {
    console.error("touch generation failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "作成に失敗しました" }, { status: 500 });
  }
}
