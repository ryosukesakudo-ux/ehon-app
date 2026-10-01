import "server-only";
import { MEMBER_MONTHLY_PREVIEWS } from "./catalog";
import { PHOTO_BUCKET, getSupabase } from "./services";

/** 日本時間の今月1日 0:00 */
export function monthStartJst(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1) - 9 * 60 * 60 * 1000);
}

/** 今月あと何枚プレビューを作れるか */
export async function remainingPreviews(userId: string) {
  const db = getSupabase();
  if (!db) return MEMBER_MONTHLY_PREVIEWS;
  const { count } = await db
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", monthStartJst().toISOString());
  return Math.max(0, MEMBER_MONTHLY_PREVIEWS - (count ?? 0));
}

export type SavedPhoto = { id: string; url: string; createdAt: string; lastUsedAt: string };

/** 会員が保存している顔写真（一時URL付き） */
export async function listPhotos(userId: string): Promise<SavedPhoto[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data: rows } = await db
    .from("user_photos")
    .select("id, path, created_at, last_used_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (!rows?.length) return [];
  const { data: urls } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(rows.map((r) => r.path), 60 * 60);
  return rows.map((r) => ({
    id: r.id,
    url: urls?.find((u) => u.path === r.path)?.signedUrl ?? "",
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }));
}

/**
 * 会員の顔写真を削除する。制作中（支払い済み・未完成）の注文で使っている写真は消せない。
 * 消した写真を使っていた下書きは、写真なしになる（プレビューは作れなくなる）。
 */
export async function deletePhoto(userId: string | null, photoId: string): Promise<{ ok: true } | { error: string }> {
  const db = getSupabase();
  if (!db) return { error: "デモモードでは写真は保存されていません" };
  let q = db.from("user_photos").select("id, path").eq("id", photoId);
  if (userId) q = q.eq("user_id", userId);
  const { data: photo } = await q.maybeSingle();
  if (!photo) return { error: "写真が見つかりません" };

  const [{ data: asChild }, { data: asMom }] = await Promise.all([
    db.from("drafts").select("id").eq("child_photo_path", photo.path),
    db.from("drafts").select("id").eq("mom_photo_path", photo.path),
  ]);
  const draftIds = [...(asChild ?? []), ...(asMom ?? [])].map((d) => d.id);
  if (draftIds.length) {
    const { data: busy } = await db.from("orders").select("id").in("draft_id", draftIds).eq("status", "paid").limit(1);
    if (busy?.length) return { error: "制作中の絵本で使っているため、完成後に削除できます" };
  }

  const { error } = await db.storage.from(PHOTO_BUCKET).remove([photo.path]);
  if (error) return { error: "写真の削除に失敗しました" };
  await db.from("user_photos").delete().eq("id", photo.id);
  const now = new Date().toISOString();
  await db.from("drafts").update({ child_photo_path: null, photos_deleted_at: now }).eq("child_photo_path", photo.path);
  await db.from("drafts").update({ mom_photo_path: null }).eq("mom_photo_path", photo.path);
  return { ok: true };
}
