import { toFile } from "openai";
import { characterArtPath } from "@/lib/characters";
import { makeShortFrame } from "@/lib/illustrate";
import { samplePublicUrl } from "@/lib/samples";
import { SAMPLE_BUCKET, getSupabase } from "@/lib/services";
import { SHORT_NEGATIVE_PROMPT, SHORT_PROMPT_RULES } from "@/lib/shorts";
import { studioFramePath, studioVideoPath, type StudioShort, type VeoQuality } from "@/lib/studio";
import { askShortQuestions, deleteShort, getCharacter, getShort, listShorts, saveShort, writeShortScript } from "@/lib/studio-server";
import { veoExtend, veoPoll, veoReady, veoStart } from "@/lib/veo";

export const maxDuration = 300;

// スタジオのショート：
//  GET ?id=…                       … 1本（無ければ一覧）
//  GET ?operation=…&id=…&clip=a|b … Veo の進み具合。できていれば保存して { done, url }
//  POST { action: "save", short }  … 保存 → { short }
//  POST { action: "delete", id }
//  POST { action: "questions", id } … ヒアリング：AIが足りない情報を質問 → { enough, questions }（保存もする）
//  POST { action: "script", id }    … 台本を書く → { short }
//  POST { action: "frame", id, which: "first" | "last", note } … クリップAの絵 → { url, seconds }
//  POST { action: "video", id, clip: "a" | "b", quality, note } … a: 絵から8秒 / b: a の動画を7秒延長 → { operation, ... }
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const operation = url.searchParams.get("operation");
  try {
    if (operation) {
      const clip = url.searchParams.get("clip") === "b" ? "b" : "a";
      const short = await getShort(id);
      const db = getSupabase();
      if (!short || !db) return Response.json({ error: "ショートが見つかりません" }, { status: 404 });
      const result = await veoPoll(operation);
      if (!result.done) return Response.json({ done: false });
      // a は8秒の動画、b は「a＋続き」で1本になった約15秒の動画
      const path = studioVideoPath(short.id, clip === "a" ? "a" : "full");
      const { error } = await db.storage.from(SAMPLE_BUCKET).upload(path, result.mp4, { contentType: "video/mp4", upsert: true, cacheControl: "300" });
      if (error) throw new Error(error.message);
      return Response.json({ done: true, url: `${samplePublicUrl(path)}?v=${Date.now()}` });
    }
    if (id) {
      const short = await getShort(id);
      return short ? Response.json({ short }) : Response.json({ error: "ショートが見つかりません" }, { status: 404 });
    }
    return Response.json({ shorts: await listShorts() });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const action = body?.action;
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 200) : "";
  try {
    if (action === "save") return Response.json({ short: await saveShort(body?.short ?? {}) });
    if (action === "delete") {
      await deleteShort(String(body?.id ?? ""));
      return Response.json({ ok: true });
    }

    // 以下は保存済みのショートに対する操作。画面の最新の内容（short）が来ていればまず保存する
    const short: StudioShort | null = body?.short ? await saveShort(body.short) : await getShort(String(body?.id ?? ""));
    if (!short) return Response.json({ error: "ショートが見つかりません" }, { status: 404 });
    const c = short.characterId ? await getCharacter(short.characterId) : null;
    if (!c) return Response.json({ error: "キャラを選んでください" }, { status: 400 });

    if (action === "questions") {
      const r = await askShortQuestions(c, short.premise, short.qa);
      const qa = [...short.qa, ...r.questions.map((q) => ({ q, a: "" }))];
      const saved = await saveShort({ ...short, qa });
      return Response.json({ ...r, short: saved });
    }
    if (action === "script") {
      const r = await writeShortScript(c, short.premise, short.qa, short);
      const saved = await saveShort({ ...short, title: short.title || r.title, clips: r.clips });
      return Response.json({ short: saved });
    }

    const db = getSupabase();
    if (!db) return Response.json({ error: "Supabase が未設定のため、保存できません" }, { status: 503 });
    const download = (path: string) => db.storage.from(SAMPLE_BUCKET).download(path).then((r) => r.data);
    const started = Date.now();

    if (action === "frame") {
      const which = body?.which === "last" ? "last" : "first";
      const a = short.clips[0];
      if (!(which === "last" ? a.lastFrame : a.frame)) return Response.json({ error: "先に台本（絵の指示）を書いてください" }, { status: 400 });
      const [sheet, faces, first] = await Promise.all([
        download(characterArtPath(c.id, "sheet")),
        download(characterArtPath(c.id, "faces")),
        which === "last" ? download(studioFramePath(short.id, "first")) : Promise.resolve(null),
      ]);
      if (!sheet) return Response.json({ error: `先にキャラ「${c.name}」の設定画を作ってください` }, { status: 400 });
      if (which === "last" && !first) return Response.json({ error: "先に最初のコマの絵を作ってください" }, { status: 400 });
      const b64 = await makeShortFrame(
        c,
        a,
        await toFile(sheet, "sheet.png", { type: "image/png" }),
        note,
        faces ? await toFile(faces, "faces.png", { type: "image/png" }) : undefined,
        which === "last" ? { firstFrame: first ? await toFile(first, "first.png", { type: "image/png" }) : undefined } : undefined,
      );
      const path = studioFramePath(short.id, which);
      const { error } = await db.storage.from(SAMPLE_BUCKET).upload(path, Buffer.from(b64, "base64"), { contentType: "image/png", upsert: true, cacheControl: "300" });
      if (error) throw new Error(error.message);
      return Response.json({ url: `${samplePublicUrl(path)}?v=${Date.now()}`, seconds: Math.round((Date.now() - started) / 1000) });
    }

    if (action === "video") {
      if (!veoReady()) return Response.json({ error: "GEMINI_API_KEY が未設定です（Vercel の環境変数に追加してください）" }, { status: 503 });
      const quality: VeoQuality = body?.quality === "standard" ? "standard" : "fast";
      const clip = body?.clip === "b" ? short.clips[1] : short.clips[0];
      if (!clip.motion) return Response.json({ error: "先に台本（動きの指示）を書いてください" }, { status: 400 });
      const character = [`Character: ${c.design}`, c.movement && `How this character moves: ${c.movement}`, `This character's voice: ${c.voice}. It never speaks words.`].filter(Boolean).join(" ");
      const extra = note && `Additional instructions from the director (may be in Japanese), follow them: ${note}`;

      if (clip.id === "a") {
        const [frame, last, sheet, faces] = await Promise.all([
          download(studioFramePath(short.id, "first")),
          download(studioFramePath(short.id, "last")),
          download(characterArtPath(c.id, "sheet")),
          download(characterArtPath(c.id, "faces")),
        ]);
        if (!frame) return Response.json({ error: "先に最初のコマの絵を作ってください" }, { status: 400 });
        const referenceImages = await Promise.all([sheet, faces].filter((b): b is Blob => Boolean(b)).map(async (b) => Buffer.from(await b.arrayBuffer())));
        const prompt = [character, clip.motion, SHORT_PROMPT_RULES, extra].filter(Boolean).join(" ");
        const { name: operation, usedReferenceImages } = await veoStart({
          prompt,
          imagePng: Buffer.from(await frame.arrayBuffer()),
          lastFramePng: last ? Buffer.from(await last.arrayBuffer()) : undefined,
          quality,
          referenceImages,
          negativePrompt: SHORT_NEGATIVE_PROMPT,
        });
        return Response.json({ operation, usedReferenceImages, usedLastFrame: Boolean(last) });
      }

      // b：a の動画そのものを渡して、続きを7秒延長する（つなぎ目なし）
      const videoA = await download(studioVideoPath(short.id, "a"));
      if (!videoA) return Response.json({ error: "先にクリップAの動画を作ってください" }, { status: 400 });
      const prompt = [character, clip.motion, SHORT_PROMPT_RULES, extra].filter(Boolean).join(" ");
      const operation = await veoExtend({ prompt, videoMp4: Buffer.from(await videoA.arrayBuffer()), quality, negativePrompt: SHORT_NEGATIVE_PROMPT });
      return Response.json({ operation });
    }

    return Response.json({ error: "不明な操作です" }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}

function fail(e: unknown) {
  console.error("studio shorts failed", e);
  return Response.json({ error: e instanceof Error ? e.message : "失敗しました" }, { status: 500 });
}
