import "server-only";
import { randomBytes } from "node:crypto";
import { REVIEW_COUPON } from "./catalog";
import { SAMPLE_BUCKET, getSupabase } from "./services";
import { samplePublicUrl } from "./samples";

// レビュー（2026-10-16 作道さん）。
// - 書けるのは、注文が届いた（発送済みの）会員だけ。1注文につき1件
// - 投稿するとすぐ公開。管理画面（/admin/reviews）で非表示にできる
// - 写真は任意。一般公開に同意したときだけ受け付け、公開ストレージ samples の reviews/ に置く
// - 投稿のお礼に、その人だけが使える1,000円引きクーポン（1回だけ）を発行し、画面とメールで知らせる

export const REVIEW_LIMITS = { nickname: 20, bodyMin: 10, bodyMax: 800 };

export type PublicReview = {
  id: string;
  nickname: string;
  rating: number;
  body: string;
  photoUrl: string | null;
  createdAt: string;
  story: string | null;
};

type Row = { id: string; nickname: string; rating: number; body: string; photo_path: string | null; created_at: string; orders?: { drafts?: { story?: string | null } | null } | null };

function toPublic(r: Row): PublicReview {
  return {
    id: r.id,
    nickname: r.nickname,
    rating: r.rating,
    body: r.body,
    photoUrl: r.photo_path ? samplePublicUrl(r.photo_path) : null,
    createdAt: r.created_at,
    story: r.orders?.drafts?.story ?? null,
  };
}

/** 公開中のレビュー（新しい順） */
export async function listPublicReviews(limit = 50): Promise<PublicReview[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from("reviews")
    .select("id, nickname, rating, body, photo_path, created_at, orders(drafts(story))")
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    // 表がまだ無い（SQL 未実行）ときは、レビューなしとして扱う
    console.warn("reviews unavailable", error.message);
    return [];
  }
  return (data as unknown as Row[]).map(toPublic);
}

/** 公開中のレビューの件数と平均（トップ・一覧の見出し用） */
export function summarize(reviews: PublicReview[]) {
  if (!reviews.length) return null;
  const avg = reviews.reduce((n, r) => n + r.rating, 0) / reviews.length;
  return { count: reviews.length, average: Math.round(avg * 10) / 10 };
}

/** レビューのお礼クーポンのコード（例：REVIEW-7K3QX9）。紛らわしい文字（0/O・1/I）は使わない */
export function newReviewCouponCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return `${REVIEW_COUPON.prefix}${Array.from(bytes, (b) => chars[b % chars.length]).join("")}`;
}

export function reviewPhotoPath(id: string) {
  return `reviews/${id}.webp`;
}

export async function removeReviewPhoto(path: string) {
  await getSupabase()?.storage.from(SAMPLE_BUCKET).remove([path]);
}
