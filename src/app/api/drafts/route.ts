import { randomUUID } from "node:crypto";
import { ANON_TRIAL_IP_DAYS, CHILD_AGES, getStory, getTaste, previewScenes, type StoryId, type TasteId } from "@/lib/catalog";
import { demoDraftId } from "@/lib/drafts";
import { currentUser } from "@/lib/auth";
import { ensureAnonId, ipHash } from "@/lib/anon";
import { PHOTO_BUCKET, getSupabase } from "@/lib/services";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function bad(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

// 写真ページの「絵本をつくる」で呼ぶ。下書きを作り、顔写真を非公開ストレージに保存する。
// 会員は保存済みの写真（childPhotoId / momPhotoId / dadPhotoId）も選べる。
// 会員でない場合は、ブラウザごと・IPアドレスごとに1回だけお試しできる。
export async function POST(request: Request) {
  const form = await request.formData();
  const taste = String(form.get("taste") ?? "");
  const story = String(form.get("story") ?? "");
  const childName = String(form.get("childName") ?? "").trim();
  const childAge = Number(form.get("childAge"));
  const consent = form.get("consent") === "true";
  const childPhoto = form.get("childPhoto");
  const momPhoto = form.get("momPhoto");
  const dadPhoto = form.get("dadPhoto");
  const childPhotoId = String(form.get("childPhotoId") ?? "");
  const momPhotoId = String(form.get("momPhotoId") ?? "");
  const dadPhotoId = String(form.get("dadPhotoId") ?? "");

  if (!getTaste(taste) || !getStory(story)) return bad("テイストとお話を選んでください");
  if (!childName || childName.length > 12) return bad("名前は12文字以内で入力してください");
  if (!CHILD_AGES.includes(childAge)) return bad("お子さまの年齢を選んでください");
  for (const f of [childPhoto, momPhoto, dadPhoto]) {
    if (!(f instanceof File)) continue;
    if (!PHOTO_TYPES[f.type]) return bad("写真は JPEG・PNG・WebP でアップロードしてください");
    if (f.size > MAX_PHOTO_BYTES) return bad("写真は10MB以下にしてください");
  }
  const newUpload = [childPhoto, momPhoto, dadPhoto].some((f) => f instanceof File);
  if (newUpload && !consent) return bad("写真の取り扱いへの同意が必要です");

  const db = getSupabase();
  if (!db) {
    if (!(childPhoto instanceof File)) return bad("お子さまの写真を選んでください");
    const demoId = demoDraftId({
      taste: taste as TasteId,
      story: story as StoryId,
      childName,
      childAge,
      hasMom: momPhoto instanceof File,
      hasDad: dadPhoto instanceof File,
    });
    return Response.json({
      draftId: demoId,
      demo: true,
      previewScenes: previewScenes(story as StoryId, { hasMom: momPhoto instanceof File, hasDad: dadPhoto instanceof File, seed: demoId }),
    });
  }

  const user = await currentUser();
  const id = randomUUID();

  const upload = async (f: File, who: string) => {
    const path = user
      ? `users/${user.id}/${randomUUID()}.${PHOTO_TYPES[f.type]}`
      : `anon/${id}/${who}.${PHOTO_TYPES[f.type]}`;
    const { error } = await db.storage
      .from(PHOTO_BUCKET)
      .upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type });
    if (error) throw new Error(error.message);
    if (user) {
      const { error: rowError } = await db.from("user_photos").insert({ user_id: user.id, path });
      if (rowError) throw new Error(rowError.message);
    }
    return path;
  };

  // 会員の保存済み写真（本人のものだけ）
  const saved = async (photoId: string) => {
    if (!user || !photoId) return null;
    const { data } = await db.from("user_photos").select("path").eq("id", photoId).eq("user_id", user.id).maybeSingle();
    return data?.path ?? null;
  };

  let hasMom = false;
  let hasDad = false;
  try {
    const childPath = childPhoto instanceof File ? await upload(childPhoto, "child") : await saved(childPhotoId);
    if (!childPath) return bad("お子さまの写真を選んでください");

    let anonId: string | null = null;
    if (!user) {
      anonId = await ensureAnonId();
      const { data: allowed, error } = await db.rpc("claim_anon_trial", {
        p_anon: anonId,
        p_ip: ipHash(request),
        p_ip_days: ANON_TRIAL_IP_DAYS,
      });
      if (error) throw new Error(error.message);
      if (!allowed) {
        await db.storage.from(PHOTO_BUCKET).remove([childPath]);
        return Response.json(
          { error: "登録なしのお試しは1回までです。続きは無料の会員登録でご利用いただけます。", needLogin: true },
          { status: 403 },
        );
      }
    }

    const momPath = momPhoto instanceof File ? await upload(momPhoto, "mom") : await saved(momPhotoId);
    const dadPath = dadPhoto instanceof File ? await upload(dadPhoto, "dad") : await saved(dadPhotoId);
    hasMom = !!momPath;
    hasDad = !!dadPath;
    const { error } = await db.from("drafts").insert({
      id,
      user_id: user?.id ?? null,
      anon_id: anonId,
      taste,
      story,
      child_name: childName,
      child_age: childAge,
      child_photo_path: childPath,
      mom_photo_path: momPath,
      dad_photo_path: dadPath,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("draft create failed", e);
    return Response.json({ error: "写真の保存に失敗しました。もう一度お試しください" }, { status: 500 });
  }

  return Response.json({
    draftId: id,
    member: !!user,
    previewScenes: previewScenes(story as StoryId, { hasMom, hasDad, seed: id }),
  });
}
