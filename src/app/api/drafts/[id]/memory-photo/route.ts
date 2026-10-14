import { randomUUID } from "node:crypto";
import { isDemoId, loadOwnedDraft, memoryPhotoDir } from "@/lib/drafts";
import { PHOTO_BUCKET, getSupabase } from "@/lib/services";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

// 注文の確認画面の「思い出の写真」（任意）。絵本の後ろの方に1ページ、そのまま印刷する（2026-10-14 作道さん）。
// 写真は非公開ストレージに入れ、保存先を返す。注文のときに画面からその保存先を送ってもらう。
// 顔写真とは別の写真で、絵を作るのには使わない。絵本の絵と同じく、支払いから100日で消す（drafts.ts の deleteDraftImages）。
export async function POST(request: Request, ctx: RouteContext<"/api/drafts/[id]/memory-photo">) {
  const { id } = await ctx.params;
  const form = await request.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File)) return bad("写真を選んでください");
  if (!PHOTO_TYPES[photo.type]) return bad("写真は JPEG・PNG・WebP でアップロードしてください");
  if (photo.size > MAX_PHOTO_BYTES) return bad("写真は10MB以下にしてください");

  const owned = await loadOwnedDraft(id);
  if (!owned) return bad("下書きが見つかりません", 404);
  const db = getSupabase();
  if (!db || isDemoId(id)) return Response.json({ path: `demo/${randomUUID()}.jpg` });
  if (!owned.user) return Response.json({ error: "ご注文には無料会員登録（ログイン）が必要です", needLogin: true }, { status: 401 });

  const path = `${memoryPhotoDir(id)}/${randomUUID()}.${PHOTO_TYPES[photo.type]}`;
  const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, Buffer.from(await photo.arrayBuffer()), { contentType: photo.type });
  if (error) {
    console.error("memory photo upload failed", error);
    return bad("写真の保存に失敗しました。もう一度お試しください", 500);
  }
  return Response.json({ path });
}
