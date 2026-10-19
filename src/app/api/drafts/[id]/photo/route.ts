import { randomUUID } from "node:crypto";
import { setSiblingPhoto } from "@/lib/siblings";
import { CHARACTER_SCENES, guestScene, type Person } from "@/lib/catalog";
import { customKeyWithPhotos, customPhotos, parseCustomKey } from "@/lib/custom-story";
import { draftGuestCount, draftOrdered, draftPeople, guestCharacterPath, isDemoId, loadOwnedDraft } from "@/lib/drafts";
import { faceFromField, faceToPathTag } from "@/lib/face";
import { BOOK_BUCKET, PHOTO_BUCKET, getSupabase } from "@/lib/services";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const PEOPLE: Person[] = ["child", "mom", "dad"];

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

// プレビューの登場人物の確認で、1人だけ写真を差し替える（2026-10-13 作道さん）。
// 写真を入れ替えて、その人のキャラクターを外す。絵はこのあと画面から作り直す（プレビュー1枚）。ほかの人のキャラクターはそのまま。
// form: who（child / mom / dad / guest0…）、photo（新しい写真）か photoId（会員の保存している写真）、face（顔を囲んだ位置）、consent
export async function POST(request: Request, ctx: RouteContext<"/api/drafts/[id]/photo">) {
  const { id } = await ctx.params;
  const form = await request.formData();
  const who = String(form.get("who") ?? "");
  const photo = form.get("photo");
  const photoId = String(form.get("photoId") ?? "");

  const owned = await loadOwnedDraft(id);
  if (!owned) return bad("下書きが見つかりません", 404);
  const { draft, user } = owned;
  const db = getSupabase();
  // 作り直しと同じく会員だけ（デモでは写真を保存しない）
  if (db && !isDemoId(id) && !user) return Response.json({ error: "写真の差し替えは無料会員登録のあとにご利用いただけます。", needLogin: true }, { status: 403 });

  const person = PEOPLE.find((p) => p === who) ?? null;
  const guest = /^guest\d$/.test(who) ? Number(who.slice(5)) : null;
  if (person ? !draftPeople(draft).includes(person) : guest === null || guest >= draftGuestCount(draft)) {
    return bad("写真を変える人を選んでください");
  }
  const scene = person ? CHARACTER_SCENES[person] : guestScene(guest!);
  if (photo instanceof File) {
    if (!PHOTO_TYPES[photo.type]) return bad("写真は JPEG・PNG・WebP でアップロードしてください");
    if (photo.size > MAX_PHOTO_BYTES) return bad("写真は10MB以下にしてください");
    if (form.get("consent") !== "true") return bad("写真の取り扱いへの同意が必要です");
  } else if (!photoId) return bad("写真を選んでください");
  if (await draftOrdered(draft.id)) return bad("ご注文済みの絵本は変更できません", 409);
  if (!db || isDemoId(id)) return Response.json({ scene });

  try {
    let path: string | null;
    if (photo instanceof File) {
      const tag = faceToPathTag(faceFromField(form.get("face")));
      path = `users/${user!.id}/${randomUUID()}${tag}.${PHOTO_TYPES[photo.type]}`;
      const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, Buffer.from(await photo.arrayBuffer()), { contentType: photo.type });
      if (error) throw new Error(error.message);
      const { error: rowError } = await db.from("user_photos").insert({ user_id: user!.id, path });
      if (rowError) throw new Error(rowError.message);
    } else {
      const { data } = await db.from("user_photos").select("path").eq("id", photoId).eq("user_id", user!.id).maybeSingle();
      path = data?.path ?? null;
      if (!path) return bad("保存している写真が見つかりません");
    }

    if (person) {
      // キャラクターを外して、作り直しのときに前の絵に引っぱられず、新しい写真から描くようにする
      // （会員の「保存しているキャラクター」の絵は消さない。作り直すと同じ場所に新しい絵が入る）
      const { error } = await db.from("drafts").update({ [`${person}_photo_path`]: path, [`${person}_character_path`]: null }).eq("id", draft.id);
      if (error) throw new Error(error.message);
    } else if (!parseCustomKey(draft.story)) {
      // 台本のお話に足した兄弟姉妹
      await setSiblingPhoto(db, draft.id, guest!, path);
      await db.storage.from(BOOK_BUCKET).remove([guestCharacterPath(draft.id, guest!)]);
    } else {
      const custom = parseCustomKey(draft.story)!;
      const photos = customPhotos(draft.story);
      const next = Array.from({ length: draftGuestCount(draft) }, (_, i) => (i === guest ? path : (photos[i] ?? null)));
      const { error } = await db.from("drafts").update({ story: customKeyWithPhotos(custom, next) }).eq("id", draft.id);
      if (error) throw new Error(error.message);
      await db.storage.from(BOOK_BUCKET).remove([guestCharacterPath(draft.id, guest!)]);
    }
  } catch (e) {
    console.error("draft photo replace failed", e);
    return bad("写真の保存に失敗しました。もう一度お試しください", 500);
  }
  return Response.json({ scene });
}
