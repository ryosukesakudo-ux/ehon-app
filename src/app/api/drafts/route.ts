import { randomUUID } from "node:crypto";
import { getStory, getTaste, type StoryId, type TasteId } from "@/lib/catalog";
import { demoDraftId } from "@/lib/drafts";
import { PHOTO_BUCKET, getSupabase } from "@/lib/services";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function bad(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

// 写真ページの「絵本をつくる」で呼ぶ。下書きを作り、顔写真を非公開ストレージに保存する。
export async function POST(request: Request) {
  const form = await request.formData();
  const taste = String(form.get("taste") ?? "");
  const story = String(form.get("story") ?? "");
  const childName = String(form.get("childName") ?? "").trim();
  const consent = form.get("consent") === "true";
  const childPhoto = form.get("childPhoto");
  const momPhoto = form.get("momPhoto");

  if (!getTaste(taste) || !getStory(story)) return bad("テイストとお話を選んでください");
  if (!childName || childName.length > 12) return bad("名前は12文字以内で入力してください");
  if (!consent) return bad("写真の取り扱いへの同意が必要です");
  if (!(childPhoto instanceof File)) return bad("お子さまの写真を選んでください");
  for (const f of [childPhoto, momPhoto]) {
    if (!(f instanceof File)) continue;
    if (!PHOTO_TYPES[f.type]) return bad("写真は JPEG・PNG・WebP でアップロードしてください");
    if (f.size > MAX_PHOTO_BYTES) return bad("写真は10MB以下にしてください");
  }

  const db = getSupabase();
  if (!db) {
    return Response.json({
      draftId: demoDraftId({
        taste: taste as TasteId,
        story: story as StoryId,
        childName,
        hasMom: momPhoto instanceof File,
      }),
      demo: true,
    });
  }

  const id = randomUUID();
  const upload = async (f: File, who: string) => {
    const path = `${id}/${who}.${PHOTO_TYPES[f.type]}`;
    const { error } = await db.storage
      .from(PHOTO_BUCKET)
      .upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type });
    if (error) throw new Error(error.message);
    return path;
  };

  try {
    const childPath = await upload(childPhoto, "child");
    const momPath = momPhoto instanceof File ? await upload(momPhoto, "mom") : null;
    const { error } = await db.from("drafts").insert({
      id,
      taste,
      story,
      child_name: childName,
      child_photo_path: childPath,
      mom_photo_path: momPath,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("draft create failed", e);
    return Response.json({ error: "写真の保存に失敗しました。もう一度お試しください" }, { status: 500 });
  }

  return Response.json({ draftId: id });
}
