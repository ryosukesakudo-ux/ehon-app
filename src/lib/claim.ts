import "server-only";
import { getAnonId } from "./anon";
import { getSupabase } from "./services";
import { rememberCharacters } from "./drafts";

/**
 * 登録前に作ったお試しの下書きと写真を、ログインした会員のものにする。
 * draftId：登録時にアカウントへ引き継いだ作りかけの下書き。確認メールを別のブラウザで開いたとき
 * （お試しのCookieが無いとき）も、その下書きを会員のものにする。
 */
export async function claimAnonData(userId: string, draftId?: string | null) {
  const db = getSupabase();
  const anonId = await getAnonId();
  if (!db || (!anonId && !draftId)) return;
  const filter = [anonId ? `anon_id.eq.${anonId}` : null, draftId && /^[0-9a-f-]{36}$/.test(draftId) ? `id.eq.${draftId}` : null].filter(Boolean);
  if (!filter.length) return;
  const { data: drafts } = await db
    .from("drafts")
    .update({ user_id: userId })
    .or(filter.join(","))
    .is("user_id", null)
    .select("*");
  const paths = (drafts ?? []).flatMap((d) => [d.child_photo_path, d.mom_photo_path, d.dad_photo_path]).filter((p): p is string => !!p);
  if (paths.length) {
    await db
      .from("user_photos")
      .upsert(paths.map((path) => ({ user_id: userId, path })), { onConflict: "path", ignoreDuplicates: true });
  }
  // お試しで作ったキャラクターも、会員の「保存しているキャラクター」にする
  await rememberCharacters(
    userId,
    (drafts ?? []).flatMap((d) =>
      (["child", "mom", "dad"] as const)
        .filter((who) => d[`${who}_character_path`])
        .map((who) => ({ who, path: d[`${who}_character_path`] as string, taste: d.taste, childName: d.child_name })),
    ),
  );
}
