import { toFile } from "openai";
import { characterArtPath } from "@/lib/characters";
import { makeShortFrame } from "@/lib/illustrate";
import { concatMp4 } from "@/lib/mp4-concat";
import { samplePublicUrl } from "@/lib/samples";
import { SAMPLE_BUCKET, getSupabase } from "@/lib/services";
import { SHORT_NEGATIVE_PROMPT, SHORT_PROMPT_RULES } from "@/lib/shorts";
import { KEYS_MAX, legacyKeyPath, legacySegmentPath, studioFullPath, studioKeyPath, studioSegmentPath, studioTakesDir, type StudioShort, type StudioTake, type VeoQuality } from "@/lib/studio";
import { askShortQuestions, deleteShort, getCharacter, getShort, isLegacyShort, listShorts, saveShort, writeShortScript } from "@/lib/studio-server";
import { veoPoll, veoReady, veoStart } from "@/lib/veo";

export const maxDuration = 300;

// スタジオのショート（止め絵方式、2026-10-20）：
//  GET ?id=…                         … 1本（無ければ一覧）。以前の形（A/B）なら絵と動画を新しい置き場所に写してから返す
//  GET ?operation=…&id=…&seg=n       … Veo の進み具合。できていれば区間 n の動画として保存して { done, url }
//  POST { action: "save", short }    … 保存 → { short }
//  POST { action: "delete", id }
//  POST { action: "duplicate", id }  … 同じキャラ・ねらい・台本で新しいショートを作る（絵と動画は付かない）→ { short }
//  POST { action: "keep", id, quality } … 今の完成動画をアーカイブに残す（押したものだけ残す：2026-10-19 作道さん）→ { name }
//  POST { action: "adopt", id, name } … アーカイブの動画を「今の完成」にする → { url }
//  POST { action: "deleteTake", id, name } … アーカイブの動画を1本消す
//  POST { action: "questions", id }  … ヒアリング：AIが足りない情報を質問 → { enough, questions }（保存もする）
//  POST { action: "script", id }     … 台本を書く → { short }
//  POST { action: "frame", id, n, note } … 止め絵 n（1から）を描く。2枚目以降は1つ前の絵を参照 → { url, seconds }
//  POST { action: "video", id, seg: n, quality, note } … 区間 n（絵 n → 絵 n+1）を Veo で作り始める → { operation, ... }
//  POST { action: "join", id }       … 全区間の動画をつないで完成（full.mp4）にする → { url, seconds }
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const operation = url.searchParams.get("operation");
  try {
    if (operation) {
      const short = await getShort(id);
      const db = getSupabase();
      if (!short || !db) return Response.json({ error: "ショートが見つかりません" }, { status: 404 });
      const seg = segmentIndex(url.searchParams.get("seg"), short);
      if (!seg) return Response.json({ error: "区間の番号が不正です" }, { status: 400 });
      const result = await veoPoll(operation);
      if (!result.done) return Response.json({ done: false });
      const path = studioSegmentPath(short.id, seg);
      const { error } = await db.storage.from(SAMPLE_BUCKET).upload(path, result.mp4, { contentType: "video/mp4", upsert: true, cacheControl: "300" });
      if (error) throw new Error(error.message);
      return Response.json({ done: true, url: `${samplePublicUrl(path)}?v=${Date.now()}` });
    }
    if (id) {
      const short = await getShort(id);
      if (!short) return Response.json({ error: "ショートが見つかりません" }, { status: 404 });
      await migrateFiles(short);
      return Response.json({ short, takes: await listTakes(short.id) });
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
      const short = await saveShort({ title: `${src.title || "題名なし"}（コピー）`.slice(0, 60), characterId: src.characterId, premise: src.premise, qa: src.qa, keys: src.keys, segments: src.segments });
      return Response.json({ short });
    }
    if (action === "keep") {
      const db = getSupabase();
      const short = await getShort(String(body?.id ?? ""));
      if (!short || !db) return Response.json({ error: "ショートが見つかりません" }, { status: 404 });
      const q = body?.quality === "standard" ? "standard" : body?.quality === "fast" ? "fast" : "";
      const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(studioFullPath(short.id));
      if (error || !data) return Response.json({ error: "先に「つないで完成にする」で完成の動画を作ってください" }, { status: 400 });
      const name = `${stamp()}-full-${q}.mp4`;
      const up = await db.storage.from(SAMPLE_BUCKET).upload(`${studioTakesDir(short.id)}/${name}`, Buffer.from(await data.arrayBuffer()), { contentType: "video/mp4", upsert: true, cacheControl: "31536000" });
      if (up.error) throw new Error(up.error.message);
      return Response.json({ name });
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
      const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(from);
      if (error || !data) throw new Error(error?.message ?? "アーカイブの動画が見つかりません");
      const path = studioFullPath(short.id);
      const up = await db.storage.from(SAMPLE_BUCKET).upload(path, Buffer.from(await data.arrayBuffer()), { contentType: "video/mp4", upsert: true, cacheControl: "300" });
      if (up.error) throw new Error(up.error.message);
      return Response.json({ url: `${samplePublicUrl(path)}?v=${Date.now()}` });
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
      const saved = await saveShort({ ...short, title: short.title || r.title, keys: r.keys, segments: r.segments });
      return Response.json({ short: saved });
    }

    const db = getSupabase();
    if (!db) return Response.json({ error: "Supabase が未設定のため、保存できません" }, { status: 503 });
    const download = (path: string) => db.storage.from(SAMPLE_BUCKET).download(path).then((r) => r.data);
    const started = Date.now();

    if (action === "frame") {
      const n = keyIndex(body?.n, short);
      if (!n) return Response.json({ error: "絵の番号が不正です" }, { status: 400 });
      const key = short.keys[n - 1];
      if (!key.frame) return Response.json({ error: `絵${n}の指示（英語）が空です。先に台本を書いてください` }, { status: 400 });
      const [sheet, faces, prev] = await Promise.all([
        download(characterArtPath(c.id, "sheet")),
        download(characterArtPath(c.id, "faces")),
        n > 1 ? download(studioKeyPath(short.id, n - 1)) : Promise.resolve(null),
      ]);
      if (!sheet) return Response.json({ error: `先にキャラ「${c.name}」の設定画を作ってください` }, { status: 400 });
      if (n > 1 && !prev) return Response.json({ error: `先に絵${n - 1}を作ってください（同じ場面に揃えるため）` }, { status: 400 });
      const b64 = await makeShortFrame(
        c,
        key.frame,
        await toFile(sheet, "sheet.png", { type: "image/png" }),
        note,
        faces ? await toFile(faces, "faces.png", { type: "image/png" }) : undefined,
        prev ? await toFile(prev, "prev.png", { type: "image/png" }) : undefined,
      );
      const path = studioKeyPath(short.id, n);
      const { error } = await db.storage.from(SAMPLE_BUCKET).upload(path, Buffer.from(b64, "base64"), { contentType: "image/png", upsert: true, cacheControl: "300" });
      if (error) throw new Error(error.message);
      return Response.json({ url: `${samplePublicUrl(path)}?v=${Date.now()}`, seconds: Math.round((Date.now() - started) / 1000) });
    }

    if (action === "video") {
      if (!veoReady()) return Response.json({ error: "GEMINI_API_KEY が未設定です（Vercel の環境変数に追加してください）" }, { status: 503 });
      const quality: VeoQuality = body?.quality === "standard" ? "standard" : "fast";
      const seg = segmentIndex(body?.seg, short);
      if (!seg) return Response.json({ error: "区間の番号が不正です" }, { status: 400 });
      const segment = short.segments[seg - 1];
      if (!segment.motion) return Response.json({ error: `区間${seg}の動きの指示（英語）が空です。先に台本を書いてください` }, { status: 400 });
      const [first, last, sheet, faces] = await Promise.all([
        download(studioKeyPath(short.id, seg)),
        download(studioKeyPath(short.id, seg + 1)),
        download(characterArtPath(c.id, "sheet")),
        download(characterArtPath(c.id, "faces")),
      ]);
      if (!first) return Response.json({ error: `先に絵${seg}を作ってください` }, { status: 400 });
      if (!last) return Response.json({ error: `先に絵${seg + 1}を作ってください` }, { status: 400 });
      const character = [`Character: ${c.design}`, c.movement && `How this character moves: ${c.movement}`, `This character's voice: ${c.voice}. It never speaks words.`].filter(Boolean).join(" ");
      const extra = note && `Additional instructions from the director (may be in Japanese), follow them: ${note}`;
      const referenceImages = await Promise.all([sheet, faces].filter((b): b is Blob => Boolean(b)).map(async (b) => Buffer.from(await b.arrayBuffer())));
      // 最初の絵と最後の絵は渡してあるので、文章では「その間」だけを書く
      const prompt = [character, `This clip starts exactly at the first frame and ends exactly at the last frame; animate only what happens between them. ${segment.motion}`, SHORT_PROMPT_RULES, extra].filter(Boolean).join(" ");
      const { name: operation, usedReferenceImages } = await veoStart({
        prompt,
        imagePng: Buffer.from(await first.arrayBuffer()),
        lastFramePng: Buffer.from(await last.arrayBuffer()),
        seconds: segment.seconds,
        quality,
        referenceImages,
        negativePrompt: SHORT_NEGATIVE_PROMPT,
      });
      return Response.json({ operation, usedReferenceImages });
    }

    if (action === "join") {
      const parts: Buffer[] = [];
      for (let i = 1; i <= short.segments.length; i++) {
        const v = await download(studioSegmentPath(short.id, i));
        if (!v) return Response.json({ error: `区間${i}の動画がまだありません。全部の区間を作ってからつないでください` }, { status: 400 });
        parts.push(Buffer.from(await v.arrayBuffer()));
      }
      const full = concatMp4(parts);
      const path = studioFullPath(short.id);
      const { error } = await db.storage.from(SAMPLE_BUCKET).upload(path, full, { contentType: "video/mp4", upsert: true, cacheControl: "300" });
      if (error) throw new Error(error.message);
      return Response.json({ url: `${samplePublicUrl(path)}?v=${Date.now()}`, seconds: Math.round((Date.now() - started) / 1000) });
    }

    return Response.json({ error: "不明な操作です" }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}

/** 絵の番号（1〜絵の数）。範囲外なら 0 */
function keyIndex(v: unknown, short: StudioShort) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= Math.min(short.keys.length, KEYS_MAX) ? n : 0;
}
/** 区間の番号（1〜区間の数）。範囲外なら 0 */
function segmentIndex(v: unknown, short: StudioShort) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= short.segments.length ? n : 0;
}

/**
 * 以前の形（クリップA/B）で保存されていたショートを開いたとき、絵（a/frame.png・a/last.png・b/last.png）と区間1の動画（a/video.mp4）を
 * 新しい置き場所（keys/n.png・segs/1.mp4）に写し、台本を新しい形で保存し直す（1回だけ。古いファイルは消さない）
 */
async function migrateFiles(short: StudioShort) {
  const db = getSupabase();
  if (!db || !(await isLegacyShort(short.id))) return;
  const copy = async (from: string | null, to: string) => {
    if (!from) return;
    const { data } = await db.storage.from(SAMPLE_BUCKET).download(from);
    if (!data) return;
    await db.storage.from(SAMPLE_BUCKET).upload(to, Buffer.from(await data.arrayBuffer()), { contentType: to.endsWith(".mp4") ? "video/mp4" : "image/png", upsert: true, cacheControl: "300" });
  };
  for (let n = 1; n <= short.keys.length; n++) await copy(legacyKeyPath(short.id, n), studioKeyPath(short.id, n));
  for (let n = 1; n <= short.segments.length; n++) await copy(legacySegmentPath(short.id, n), studioSegmentPath(short.id, n));
  await saveShort(short);
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
