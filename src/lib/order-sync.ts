import "server-only";
import type Stripe from "stripe";
import { headers } from "next/headers";
import { getStripe, getSupabase } from "./services";
import { sendKonbiniGuide, sendOrderConfirmation } from "./order-mail";

/**
 * Stripe の決済画面（Checkout セッション）の結果を注文に記録する。
 * お届け先を保存し、カードなどその場で払えた場合（クーポンで0円の場合も）は「支払い済み」にする。
 * 支払い済みになったら、会員登録のメールアドレスに「ご注文完了」メールを送る。
 * コンビニ払いはサイトに戻らないため、決済画面を終えた時点でお支払い番号の案内メールを送る。
 * Stripe からの通知（webhook）と、通知が届かなかったときの確認（syncPendingOrders）の両方から呼ぶ。
 * 同じ注文で二重に記録・送信しないよう、まだ「決済前」の注文だけを更新する。
 */
export async function applyCheckoutSession(
  session: Stripe.Checkout.Session,
  base: string,
  opts: { at: Date; firstNotice: boolean },
): Promise<{ ok: boolean }> {
  const db = getSupabase();
  const orderId = session.metadata?.order_id;
  if (!db || !orderId) return { ok: true };
  const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

  const { data: updated, error } = await db
    .from("orders")
    .update({
      checkout_completed_at: opts.at.toISOString(),
      email: session.customer_details?.email ?? null,
      phone: session.customer_details?.phone ?? null,
      shipping: session.collected_information?.shipping_details ?? null,
      amount: session.amount_total,
      ...(paymentIntent ? { stripe_payment_intent: paymentIntent } : {}),
      ...(paid ? { status: "paid", paid_at: new Date().toISOString() } : {}),
    })
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id");
  if (error) {
    console.error("order update failed", error);
    return { ok: false };
  }
  // 支払い済みになったときだけ（同じ注文で二重に送らない）、ご注文完了メールを送る
  if (paid && updated?.length) {
    await sendOrderConfirmation(orderId, base).catch((e) => console.error("order mail failed", e));
  }
  if (!paid && opts.firstNotice && updated?.length) {
    await sendKonbiniGuide(orderId, base).catch((e) => console.error("konbini mail failed", e));
  }
  return { ok: true };
}

/**
 * Stripe からの通知が届かなかった注文を、Stripe に問い合わせて記録し直す。
 * （例：2026-10-13 本番切り替え直後、本番側に Webhook の送信先が無く「支払い済み」にならなかった）
 * 決済画面を作ってから2日以内で、まだ決済画面の結果が記録されていない注文だけを確かめる。
 * userId を渡すとその会員の注文だけ、orderId を渡すとその注文だけを確かめる。
 */
export async function syncPendingOrders(filter: { userId?: string; orderId?: string }) {
  const db = getSupabase();
  const stripe = getStripe();
  if (!db || !stripe) return;
  let q = db
    .from("orders")
    .select("id, stripe_session_id")
    .eq("status", "pending")
    .is("checkout_completed_at", null)
    .not("stripe_session_id", "is", null)
    .gte("created_at", new Date(Date.now() - 2 * 86400_000).toISOString())
    .limit(20);
  if (filter.userId) q = q.eq("user_id", filter.userId);
  if (filter.orderId) q = q.eq("id", filter.orderId);
  const { data: orders, error } = await q;
  if (error || !orders?.length) return;

  const base = await currentBase();
  await Promise.all(
    orders.map(async (o) => {
      const session = await stripe.checkout.sessions.retrieve(o.stripe_session_id).catch((e) => {
        console.error("checkout session lookup failed", o.id, e);
        return null;
      });
      if (session?.status !== "complete") return;
      await applyCheckoutSession(session, base, { at: new Date(session.created * 1000), firstNotice: true });
    }),
  );
}

async function currentBase() {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}
