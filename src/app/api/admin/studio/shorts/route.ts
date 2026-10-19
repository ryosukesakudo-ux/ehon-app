import { toFile } from "openai";
import { characterArtPath } from "@/lib/characters";
import { makeShortFrame } from "@/lib/illustrate";
import { samplePublicUrl } from "@/lib/samples";
import { SAMPLE_BUCKET, getSupabase } from "@/lib/services";
import { SHORT_NEGATIVE_PROMPT, SHORT_PROMPT_RULES } from "@/lib/shorts";
import { studioFramePath, studioTakesDir, studioVideoPath, type StudioFrameKind, type StudioShort, type StudioTake, type VeoQuality } from "@/lib/studio";
import { askShortQuestions, deleteShort, getCharacter, getShort, listShorts, saveShort, writeClipBLastFrame, writeShortScript } from "@/lib/studio-server";
import { veoExtend, veoPoll, veoReady, veoStart } from "@/lib/veo";

export const maxDuration = 300;

// スタジオのショート：
//  GET ?id=…                       … 1本（無ければ一覧）
//  GET ?operation=…&id=…&clip=a|b&q=fast|standard … Veo の進み具合。できていれば保存（＋アーカイブに1本残す）して { done, url }
//  POST { action: "save", short }  … 保存 → { short }
//  POST { action: "delete", id }
//  POST { action: "duplicate", id } … 同じキャラ・ねらい・台本で新しいショートを作る（絵と動画は付かない）→ { short }
//  POST { action: "adopt", id, name } … アーカイブの動画を「今の動画」（A または 完成）にする → { url }
//  POST { action: "deleteTake", id, name } … アーカイブの動画を1本消す
//  POST { action: "questions", id } … ヒアリング：AIが足りない情報を質問 → { enough, questions }（保存もする）
//  POST { action: "script", id }    … 台本を書く → { short }
//  POST { action: "frame", id, which: "first" | "last" | "lastB", note } … Aの最初・Aの最後（8秒）・Bの最後（15秒）の絵 → { url, seconds }
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
      // アーカイブにも1本残す（作り直しても古い動画が消えないように）
      const q = url.searchParams.get("q") === "standard" ? "standard" : "fast";
      const takeName = `${stamp()}-${clip === "a" ? "a" : "full"}-${q}.mp4`;
      await db.storage.from(SAMPLE_BUCKET).upload(`${studioTakesDir(short.id)}/${takeName}`, result.mp4, { contentType: "video/mp4", upsert: true, cacheControl: "31536000" });
      return Response.json({ done: true, url: `${samplePublicUrl(path)}?v=${Date.now()}` });
    }
    if (id) {
      const short = await getShort(id);
      return short ? Response.json({ short, takes: await listTakes(short.id) }) : Response.json({ error: "ショートが見つかりません" }, { status: 404 });
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
    if (action === "duplicate") {
      const src = await getShort(String(body?.id ?? ""));
      if (!src) return Response.json({ error: "ショートが見つかりません" }, { status: 404 });
      const short = await saveShort({ title: `${src.title || "題名なし"}（コピー）`.slice(0, 60), characterId: src.characterId, premise: src.premise, qa: src.qa, clips: src.clips });
      return Response.json({ short });
    }
    if (action === "adopt" || action === "deleteTake") {
      const db = getSupabase();
      const short = await getShort(String(body?.id ?? ""));
      const name = String(body?.name ?? "");
      if (!short || !db) return Response.json({ error: "ショートが見つかりません" }, { status: 404 });
      if (!/^[0-9]{8}-[0-9]{6}-(a|full)-[a-z]*\.mp4$/.test(name)) return Response.json({ error: "アーカイブの名前が不正です" }, { status: 400 });
      const from = `${studioTakesDir(short.id)}/${name}`;
      if (action === "deleteTake") {
        const { error } = await db.storage.from(SAMPLE_BUCKET).remove([from]);
        if (error) throw new Error(error.message);
        return Response.json({ ok: true });
      }
      const kind = name.includes("-full-") ? "full" : "a";
      const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(from);
      if (error || !data) throw new Error(error?.message ?? "アーカイブの動画が見つかりません");
      const path = studioVideoPath(short.id, kind);
      const up = await db.storage.from(SAMPLE_BUCKET).upload(path, Buffer.from(await data.arrayBuffer()), { contentType: "video/mp4", upsert: true, cacheControl: "300" });
      if (up.error) throw new Error(up.error.message);
      return Response.json({ kind, url: `${samplePublicUrl(path)}?v=${Date.now()}` });
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
      const which: StudioFrameKind = body?.which === "last" ? "last" : body?.which === "lastB" ? "lastB" : "first";
      // first/last はクリップA、lastB はクリップB（15秒時点）。B の最後は A の最後の絵を参照して同じ場面・タッチに揃える
      let clip = which === "lastB" ? short.clips[1] : short.clips[0];
      let filled = false;
      if (which === "lastB" && !clip.lastFrame && short.clips[1].motion) {
        // 古い台本（Bの最後の絵が無い）は、台本全体を書き直さずに15秒時点の絵の指示だけ AI に足して保存する
        const lastFrame = await writeClipBLastFrame(c, short);
        const saved = await saveShort({ ...short, clips: [short.clips[0], { ...short.clips[1], lastFrame }] });
        clip = saved.clips[1];
        filled = true;
      }
      const prompt = which === "first" ? clip.frame : clip.lastFrame;
      if (!prompt) return Response.json({ error: "先に台本（絵の指示）を書いてください" }, { status: 400 });
      const refPath = which === "last" ? studioFramePath(short.id, "first") : which === "lastB" ? studioFramePath(short.id, "last") : null;
      const [sheet, faces, ref] = await Promise.all([
        download(characterArtPath(c.id, "sheet")),
        download(characterArtPath(c.id, "faces")),
        refPath ? download(refPath) : Promise.resolve(null),
      ]);
      if (!sheet) return Response.json({ error: `先にキャラ「${c.name}」の設定画を作ってください` }, { status: 400 });
      if (which === "last" && !ref) return Response.json({ error: "先に最初のコマの絵を作ってください" }, { status: 400 });
      if (which === "lastB" && !ref) return Response.json({ error: "先にクリップAの最後のコマの絵を作ってください" }, { status: 400 });
      const b64 = await makeShortFrame(
        c,
        clip,
        await toFile(sheet, "sheet.png", { type: "image/png" }),
        note,
        faces ? await toFile(faces, "faces.png", { type: "image/png" }) : undefined,
        which === "first" ? undefined : { firstFrame: ref ? await toFile(ref, "ref.png", { type: "image/png" }) : undefined },
      );
      const path = studioFramePath(short.id, which);
      const { error } = await db.storage.from(SAMPLE_BUCKET).upload(path, Buffer.from(b64, "base64"), { contentType: "image/png", upsert: true, cacheControl: "300" });
      if (error) throw new Error(error.message);
      return Response.json({ url: `${samplePublicUrl(path)}?v=${Date.now()}`, seconds: Math.round((Date.now() - started) / 1000), lastFrame: filled ? clip.lastFrame : undefined });
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

      // b：a の動画そのものを渡して、続きを7秒延長する（つなぎ目なし）。15秒時点の絵があれば終わりとして渡す
      const [videoA, lastB] = await Promise.all([download(studioVideoPath(short.id, "a")), download(studioFramePath(short.id, "lastB"))]);
      if (!videoA) return Response.json({ error: "先にクリップAの動画を作ってください" }, { status: 400 });
      const prompt = [character, clip.motion, SHORT_PROMPT_RULES, extra].filter(Boolean).join(" ");
      const { name: operation, usedLastFrame } = await veoExtend({
        prompt,
        videoMp4: Buffer.from(await videoA.arrayBuffer()),
        lastFramePng: lastB ? Buffer.from(await lastB.arrayBuffer()) : undefined,
        quality,
        negativePrompt: SHORT_NEGATIVE_PROMPT,
      });
      return Response.json({ operation, usedLastFrame, hadLastFrame: Boolean(lastB) });
    }

    return Response.json({ error: "不明な操作です" }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}

/** アーカイブの動画一覧（新しい順）。名前 = 日時-種類-画質.mp4 */
async function listTakes(shortId: string): Promise<StudioTake[]> {
  const db = getSupabase();
  if (!db) return [];
  const dir = studioTakesDir(shortId);
  const { data } = await db.storage.from(SAMPLE_BUCKET).list(dir, { limit: 200, sortBy: { column: "name", order: "desc" } });
  return (data ?? [])
    .map((f) => {
      const m = /^([0-9]{4})([0-9]{2})([0-9]{2})-([0-9]{2})([0-9]{2})([0-9]{2})-(a|full)-([a-z]*)\.mp4$/.exec(f.name);
      if (!m) return null;
      const at = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
      const quality: StudioTake["quality"] = m[8] === "standard" ? "standard" : m[8] === "fast" ? "fast" : "";
      return { name: f.name, kind: m[7] as "a" | "full", quality, at, url: samplePublicUrl(`${dir}/${f.name}`) ?? "" };
    })
    .filter((t): t is StudioTake => t !== null);
}

function stamp(d = new Date()) {
  return d.toISOString().replace(/[-:T]/g, "").slice(0, 15).replace(/^(\d{8})(\d{6}).*$/, "$1-$2");
}

function fail(e: unknown) {
  console.error("studio shorts failed", e);
  return Response.json({ error: e instanceof Error ? e.message : "失敗しました" }, { status: 500 });
}
