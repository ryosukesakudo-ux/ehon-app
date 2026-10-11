import "server-only";
import { REPEAT_COUPON } from "./catalog";
import { getSupabase } from "./services";

/** bookPrice：1冊目の値段を決めるクーポン。discount：1冊目から値引きするクーポン（リピート割引） */
export type Coupon = { code: string; label: string; bookPrice?: number; discount?: number };

/** 入力されたコードを揃える（前後の空白を取り、大文字に） */
export function normalizeCouponCode(code: unknown) {
  return String(code ?? "").trim().toUpperCase();
}

/**
 * クーポンを確認する。使えるのは有効なコードで、その人がまだ使っていないもの（1人1回まで）。
 * 決済画面で止めた注文（お支払い前に戻った注文）は「使った」に数えない。
 */
export async function findCoupon(rawCode: unknown, userId: string): Promise<{ coupon: Coupon } | { error: string }> {
  const code = normalizeCouponCode(rawCode);
  const db = getSupabase();
  if (!code) return { error: "クーポンコードを入力してください" };
  if (!db) return { error: "デモモードではクーポンは使えません" };
  if (code === REPEAT_COUPON.code) return findRepeatCoupon(userId);
  const { data: row } = await db.from("coupons").select("code, label, book_price, active").eq("code", code).maybeSingle();
  if (!row || !row.active) return { error: "このクーポンコードは使えません" };
  const { count } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("coupon_code", code)
    .eq("user_id", userId)
    .or("status.neq.pending,checkout_completed_at.not.is.null");
  if (count) return { error: "このクーポンはご利用済みです（おひとり様1回まで）" };
  return { coupon: { code: row.code, label: row.label, bookPrice: row.book_price } };
}

/** リピート割引：支払い済みの注文が1件でもある会員なら、何度でも使える */
async function findRepeatCoupon(userId: string): Promise<{ coupon: Coupon } | { error: string }> {
  const { count } = await getSupabase()!
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("paid_at", "is", null);
  if (!count) return { error: "このクーポンは、2回目以降のご注文で使えます" };
  return { coupon: { code: REPEAT_COUPON.code, label: `${REPEAT_COUPON.label} ${REPEAT_COUPON.discount}円引き`, discount: REPEAT_COUPON.discount } };
}
