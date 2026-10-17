import { toFile } from "openai";
import { CHARACTER_LINEUP_PATH, ORIGINAL_CHARACTERS, characterArtPath, getOriginalCharacter } from "@/lib/characters";
import { makeOriginalCharacterFaces, makeOriginalCharacterSheet, makeOriginalLineup } from "@/lib/illustrate";
import { samplePublicUrl } from "@/lib/samples";
import { SAMPLE_BUCKET, getSupabase } from "@/lib/services";

export const maxDuration = 300;

// キャラスタジオ：オリジナルキャラ6体の設定画（三面図）・表情・全員の並びを作って、公開ストレージ samples に保存する。
// body: { kind: "sheet" | "faces", id } または { kind: "lineup" }、note は追加の指示（任意）
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const kind = body?.kind;
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定のため、絵を保存できません" }, { status: 503 });

  const load = async (path: string, name: string) => {
    const { data } = await db.storage.from(SAMPLE_BUCKET).download(path);
    return data ? toFile(data, name, { type: "image/png" }) : null;
  };
  const save = async (path: string, b64: string) => {
    const { error } = await db.storage
      .from(SAMPLE_BUCKET)
      .upload(path, Buffer.from(b64, "base64"), { contentType: "image/png", upsert: true, cacheControl: "300" });
    if (error) throw new Error(error.message);
    return `${samplePublicUrl(path)}?v=${Date.now()}`;
  };

  try {
    const started = Date.now();
    if (kind === "lineup") {
      // 設定画ができているキャラだけを並べる
      const items: Parameters<typeof makeOriginalLineup>[0] = [];
      for (const c of ORIGINAL_CHARACTERS) {
        const sheet = await load(characterArtPath(c.id, "sheet"), `${c.id}.png`);
        if (sheet) items.push({ c, sheet });
      }
      if (items.length < 2) return Response.json({ error: "先に2体以上の設定画を作ってください" }, { status: 400 });
      const url = await save(CHARACTER_LINEUP_PATH, await makeOriginalLineup(items, note));
      return Response.json({ url, seconds: Math.round((Date.now() - started) / 1000) });
    }

    const c = getOriginalCharacter(String(body?.id ?? ""));
    if (!c) return Response.json({ error: "キャラクターが見つかりません" }, { status: 400 });

    if (kind === "sheet") {
      const url = await save(characterArtPath(c.id, "sheet"), await makeOriginalCharacterSheet(c, note));
      return Response.json({ url, seconds: Math.round((Date.now() - started) / 1000) });
    }
    if (kind === "faces") {
      const sheet = await load(characterArtPath(c.id, "sheet"), "sheet.png");
      if (!sheet) return Response.json({ error: "先にこのキャラの設定画を作ってください" }, { status: 400 });
      const url = await save(characterArtPath(c.id, "faces"), await makeOriginalCharacterFaces(c, sheet, note));
      return Response.json({ url, seconds: Math.round((Date.now() - started) / 1000) });
    }
    return Response.json({ error: "不明な操作です" }, { status: 400 });
  } catch (e) {
    console.error("original character generation failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "作成に失敗しました" }, { status: 500 });
  }
}
