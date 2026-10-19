import { toFile } from "openai";
import { CHARACTER_LINEUP_PATH, characterArtPath } from "@/lib/characters";
import { makeOriginalCharacterFaces, makeOriginalCharacterSheet, makeOriginalLineup } from "@/lib/illustrate";
import { samplePublicUrl } from "@/lib/samples";
import { SAMPLE_BUCKET, getSupabase } from "@/lib/services";
import { deleteCharacter, getCharacter, importSeeds, listCharacters, saveCharacter, writeCharacterEnglish } from "@/lib/studio-server";

export const maxDuration = 300;

// スタジオのキャラ：
//  GET                                   … 一覧
//  POST { action: "save", character }    … 保存（id が無ければ新規）→ { character }
//  POST { action: "delete", id }
//  POST { action: "english", character } … 日本語の設定から英語の指示（design / voice / movement）をAIが書く
//  POST { action: "art", id, kind: "sheet" | "faces", note } … 設定画・表情集を作って保存 → { url, seconds }
//  POST { action: "lineup", note }       … 設定画のあるキャラを並べる
//  POST { action: "import" }             … コード直書きの6体と「かじっていい？」を取り込む
export async function GET() {
  try {
    return Response.json({ characters: await listCharacters() });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const action = body?.action;
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  try {
    if (action === "save") return Response.json({ character: await saveCharacter(body?.character ?? {}) });
    if (action === "delete") {
      await deleteCharacter(String(body?.id ?? ""));
      return Response.json({ ok: true });
    }
    if (action === "english") return Response.json(await writeCharacterEnglish(body?.character ?? {}));
    if (action === "import") return Response.json(await importSeeds());

    const db = getSupabase();
    if (!db) return Response.json({ error: "Supabase が未設定のため、絵を保存できません" }, { status: 503 });
    const load = async (path: string, name: string) => {
      const { data } = await db.storage.from(SAMPLE_BUCKET).download(path);
      return data ? toFile(data, name, { type: "image/png" }) : null;
    };
    const save = async (path: string, b64: string) => {
      const { error } = await db.storage.from(SAMPLE_BUCKET).upload(path, Buffer.from(b64, "base64"), { contentType: "image/png", upsert: true, cacheControl: "300" });
      if (error) throw new Error(error.message);
      return `${samplePublicUrl(path)}?v=${Date.now()}`;
    };
    const started = Date.now();

    if (action === "lineup") {
      const items: Parameters<typeof makeOriginalLineup>[0] = [];
      for (const c of await listCharacters()) {
        const sheet = await load(characterArtPath(c.id, "sheet"), `${c.id}.png`);
        if (sheet) items.push({ c, sheet });
      }
      if (items.length < 2) return Response.json({ error: "先に2体以上の設定画を作ってください" }, { status: 400 });
      return Response.json({ url: await save(CHARACTER_LINEUP_PATH, await makeOriginalLineup(items, note)), seconds: Math.round((Date.now() - started) / 1000) });
    }

    if (action === "art") {
      const c = await getCharacter(String(body?.id ?? ""));
      if (!c) return Response.json({ error: "キャラクターが見つかりません" }, { status: 404 });
      if (!c.design) return Response.json({ error: "先に「見た目の指示（英語）」を作ってください（AIに英語を書かせる）" }, { status: 400 });
      if (body?.kind === "sheet") {
        return Response.json({ url: await save(characterArtPath(c.id, "sheet"), await makeOriginalCharacterSheet(c, note)), seconds: Math.round((Date.now() - started) / 1000) });
      }
      if (body?.kind === "faces") {
        const sheet = await load(characterArtPath(c.id, "sheet"), "sheet.png");
        if (!sheet) return Response.json({ error: "先にこのキャラの設定画を作ってください" }, { status: 400 });
        return Response.json({ url: await save(characterArtPath(c.id, "faces"), await makeOriginalCharacterFaces(c, sheet, note)), seconds: Math.round((Date.now() - started) / 1000) });
      }
    }
    return Response.json({ error: "不明な操作です" }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}

function fail(e: unknown) {
  console.error("studio characters failed", e);
  return Response.json({ error: e instanceof Error ? e.message : "失敗しました" }, { status: 500 });
}
