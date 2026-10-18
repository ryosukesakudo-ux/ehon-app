import { toFile } from "openai";
import { characterArtPath, getOriginalCharacter } from "@/lib/characters";
import { makeShortFrame } from "@/lib/illustrate";
import { samplePublicUrl } from "@/lib/samples";
import { SAMPLE_BUCKET, getSupabase } from "@/lib/services";
import { SHORT_NEGATIVE_PROMPT, SHORT_PROMPT_RULES, getShort, shortFramePath, shortVideoPath, type VeoQuality } from "@/lib/shorts";
import { veoPoll, veoReady, veoStart } from "@/lib/veo";

export const maxDuration = 300;

// ショートスタジオ：
//  POST { shortId, clipId, kind: "frame", note }            … クリップの最初のコマの絵を作って保存
//  POST { shortId, clipId, kind: "video", quality, note }   … 保存した絵から Veo で動画の作成を始める → { operation }
//  GET  ?operation=…&shortId=…&clipId=…                      … できたか確認。できていれば mp4 を保存して { url }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定のため、保存できません" }, { status: 503 });
  const short = getShort(String(body?.shortId ?? ""));
  const clip = short?.clips.find((c) => c.id === body?.clipId);
  const c = short && getOriginalCharacter(short.character);
  if (!short || !clip || !c) return Response.json({ error: "クリップが見つかりません" }, { status: 400 });
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  try {
    if (body?.kind === "frame") {
      const { data: sheet } = await db.storage.from(SAMPLE_BUCKET).download(characterArtPath(c.id, "sheet"));
      if (!sheet) return Response.json({ error: `先にキャラスタジオで ${c.name} の設定画を作ってください` }, { status: 400 });
      const started = Date.now();
      const b64 = await makeShortFrame(c, clip, await toFile(sheet, "sheet.png", { type: "image/png" }), note);
      const path = shortFramePath(short.id, clip.id);
      const { error } = await db.storage
        .from(SAMPLE_BUCKET)
        .upload(path, Buffer.from(b64, "base64"), { contentType: "image/png", upsert: true, cacheControl: "300" });
      if (error) throw new Error(error.message);
      return Response.json({ url: `${samplePublicUrl(path)}?v=${Date.now()}`, seconds: Math.round((Date.now() - started) / 1000) });
    }

    if (body?.kind === "video") {
      if (!veoReady()) return Response.json({ error: "GEMINI_API_KEY が未設定です（Vercel の環境変数に追加してください）" }, { status: 503 });
      const quality: VeoQuality = body?.quality === "standard" ? "standard" : "fast";
      const { data: frame } = await db.storage.from(SAMPLE_BUCKET).download(shortFramePath(short.id, clip.id));
      if (!frame) return Response.json({ error: "先にこのクリップの絵を作ってください" }, { status: 400 });
      // 設定画と表情集を参考画像にして、動いたときも顔が変わらないようにする
      const [{ data: sheet }, { data: faces }] = await Promise.all([
        db.storage.from(SAMPLE_BUCKET).download(characterArtPath(c.id, "sheet")),
        db.storage.from(SAMPLE_BUCKET).download(characterArtPath(c.id, "faces")),
      ]);
      const referenceImages = await Promise.all([sheet, faces].filter((b): b is Blob => Boolean(b)).map(async (b) => Buffer.from(await b.arrayBuffer())));
      // キャラの見た目の説明 → 動き → 共通ルール → 追加の指示（日本語でもよい）
      const prompt = [
        `Character: ${c.design}`,
        clip.motion,
        SHORT_PROMPT_RULES,
        note && `Additional instructions from the director (may be in Japanese), follow them: ${note}`,
      ].filter(Boolean).join(" ");
      const operation = await veoStart({ prompt, imagePng: Buffer.from(await frame.arrayBuffer()), quality, referenceImages, negativePrompt: SHORT_NEGATIVE_PROMPT });
      return Response.json({ operation });
    }

    return Response.json({ error: "不明な操作です" }, { status: 400 });
  } catch (e) {
    console.error("shorts studio failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "作成に失敗しました" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const operation = url.searchParams.get("operation") ?? "";
  const short = getShort(url.searchParams.get("shortId") ?? "");
  const clip = short?.clips.find((c) => c.id === url.searchParams.get("clipId"));
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定のため、保存できません" }, { status: 503 });
  if (!short || !clip || !operation) return Response.json({ error: "クリップが見つかりません" }, { status: 400 });

  try {
    const result = await veoPoll(operation);
    if (!result.done) return Response.json({ done: false });
    const path = shortVideoPath(short.id, clip.id);
    const { error } = await db.storage.from(SAMPLE_BUCKET).upload(path, result.mp4, { contentType: "video/mp4", upsert: true, cacheControl: "300" });
    if (error) throw new Error(error.message);
    return Response.json({ done: true, url: `${samplePublicUrl(path)}?v=${Date.now()}` });
  } catch (e) {
    console.error("shorts video poll failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "確認に失敗しました" }, { status: 500 });
  }
}
