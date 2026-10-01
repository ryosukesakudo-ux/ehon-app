import "server-only";
import { getAnonId } from "./anon";
import { getSupabase } from "./services";

/** 登録前に作ったお試しの下書きと写真を、ログインした会員のものにする。 */
export async function claimAnonData(userId: string) {
  const db = getSupabase();
  const anonId = await getAnonId();
  if (!db || !anonId) return;
  const { data: drafts } = await db
    .from("drafts")
    .update({ user_id: userId })
    .eq("anon_id", anonId)
    .is("user_id", null)
    .select("child_photo_path, mom_photo_path, dad_photo_path");
  const paths = (drafts ?? []).flatMap((d) => [d.child_photo_path, d.mom_photo_path, d.dad_photo_path]).filter((p): p is string => !!p);
  if (paths.length) {
    await db
      .from("user_photos")
      .upsert(paths.map((path) => ({ user_id: userId, path })), { onConflict: "path", ignoreDuplicates: true });
  }
}
