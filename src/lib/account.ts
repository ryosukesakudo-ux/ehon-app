import "server-only";
import { MEMBER_MONTHLY_PREVIEWS } from "./catalog";
import { PHOTO_BUCKET, getSupabase } from "./services";

/** 日本時間の今月1日 0:00 */
export function monthStartJst(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1) - 9 * 60 * 60 * 1000);
}

export type PreviewQuota = {
  /** 今月の無料枠の残り */
  free: number;
  /** 追加購入した枠の残り（月をまたいでも残る） */
  credits: number;
  /** 合計で、あと何枚プレビューを作れるか */
  remaining: number;
};

/** あと何枚プレビューを作れるか（今月の無料枠＋追加枠） */
export async function previewQuota(userId: string): Promise<PreviewQuota> {
  const db = getSupabase();
  if (!db) return { free: MEMBER_MONTHLY_PREVIEWS, credits: 0, remaining: MEMBER_MONTHLY_PREVIEWS };
  const used = await db
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("paid", false)
    .gte("created_at", monthStartJst().toISOString());
  // paid 列がまだ無い（SQL 未実行）ときは、今月の全件を無料枠として数える
  const { count } = used.error
    ? await db.from("generations").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", monthStartJst().toISOString())
    : used;
  const { data: row } = await db.from("preview_credits").select("balance").eq("user_id", userId).maybeSingle();
  const free = Math.max(0, MEMBER_MONTHLY_PREVIEWS - (count ?? 0));
  const credits = row?.balance ?? 0;
  return { free, credits, remaining: free + credits };
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

  const found = await Promise.all(
    (["child_photo_path", "mom_photo_path", "dad_photo_path"] as const).map((col) =>
      db.from("drafts").select("id").eq(col, photo.path),
    ),
  );
  const draftIds = found.flatMap((r) => r.data ?? []).map((d) => d.id);
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
  await db.from("drafts").update({ dad_photo_path: null }).eq("dad_photo_path", photo.path);
  return { ok: true };
}
