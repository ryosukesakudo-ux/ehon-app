import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOK_MESSAGE_MAX, isHonorificId, type HonorificId } from "@/lib/catalog";
import { memoryPhotoDir } from "@/lib/drafts";
import { BOOK_BUCKET } from "@/lib/services";

// 注文ごとの、絵本の特別ページに入れる内容（呼び方・おうちの方からのメッセージ・思い出の写真）。2026-10-14 作道さん。
// データベースの列を増やさずに済むよう、注文のときに JSON で絵の隣（BOOK_BUCKET）に保存する。
export type BookExtras = {
  honorific: HonorificId | null;
  message: string;
  /** 思い出の写真の保存先（PHOTO_BUCKET）。無ければ null */
  memoryPhotoPath: string | null;
};

export function bookExtrasPath(draftId: string, orderId: string) {
  return `${draftId}/extras/${orderId}.json`;
}

/** 画面から送られた内容をそろえる。思い出の写真は、その下書きの置き場所にあるものだけ受け付ける */
export function parseBookExtras(draftId: string, v: { childHonorific?: unknown; bookMessage?: unknown; memoryPhotoPath?: unknown }): BookExtras {
  const message = typeof v.bookMessage === "string" ? v.bookMessage.replace(/\r\n?/g, "\n").trim().slice(0, BOOK_MESSAGE_MAX) : "";
  const photo = typeof v.memoryPhotoPath === "string" ? v.memoryPhotoPath : "";
  const photoOk = new RegExp(`^${memoryPhotoDir(draftId)}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(photo);
  return { honorific: isHonorificId(v.childHonorific) ? v.childHonorific : null, message, memoryPhotoPath: photoOk ? photo : null };
}

export async function saveBookExtras(db: SupabaseClient, draftId: string, orderId: string, extras: BookExtras) {
  const { error } = await db.storage
    .from(BOOK_BUCKET)
    .upload(bookExtrasPath(draftId, orderId), Buffer.from(JSON.stringify(extras)), { contentType: "application/json", upsert: true });
  if (error) throw new Error(error.message);
}

/** 保存が無い注文（2026-10-14 より前の注文）は、呼び方なし・メッセージなし・写真なし */
export async function loadBookExtras(db: SupabaseClient, draftId: string, orderId: string): Promise<BookExtras> {
  const { data } = await db.storage.from(BOOK_BUCKET).download(bookExtrasPath(draftId, orderId));
  if (!data) return { honorific: null, message: "", memoryPhotoPath: null };
  try {
    const v = JSON.parse(await data.text());
    return parseBookExtras(draftId, { childHonorific: v.honorific, bookMessage: v.message, memoryPhotoPath: v.memoryPhotoPath });
  } catch {
    return { honorific: null, message: "", memoryPhotoPath: null };
  }
}
