import { toFile } from "openai";
import { makeDeformeCharacters } from "@/lib/illustrate";
import { SHOWCASE_PHOTO } from "@/lib/samples";
import { SAMPLE_BUCKET, getSupabase } from "@/lib/services";
import { toJpegB64 } from "@/lib/upscale";

export const maxDuration = 300;

// デフォルメ試作：作例の家族写真（トップの①）から、デフォルメ調の3人を1枚作って返すだけ（保存はしない）。
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定のため、家族写真を読み込めません" }, { status: 503 });
  const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(SHOWCASE_PHOTO);
  if (error || !data) return Response.json({ error: "先に作例スタジオで「この写真から」①（家族の写真）を作ってください" }, { status: 400 });

  try {
    const started = Date.now();
    const b64 = await makeDeformeCharacters(await toFile(data, "photo.png", { type: "image/png" }), note);
    const seconds = Math.round((Date.now() - started) / 1000);
    return Response.json({ image: `data:image/jpeg;base64,${await toJpegB64(b64)}`, seconds });
  } catch (e) {
    console.error("deforme generation failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "作成に失敗しました" }, { status: 500 });
  }
}
