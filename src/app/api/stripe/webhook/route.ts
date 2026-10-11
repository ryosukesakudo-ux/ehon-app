import type Stripe from "stripe";
import { getStripe, getSupabase, siteUrl } from "@/lib/services";
import { sendKonbiniGuide, sendOrderConfirmation } from "@/lib/order-mail";

// Stripe からの通知。
// - checkout.session.completed：お届け先を保存。カードなどその場で払えた場合（クーポンで0円の場合も）は「支払い済み」にする。
// - checkout.session.async_payment_succeeded：コンビニ払いなど、後から支払いが済んだとき「支払い済み」にする。
// 支払い済みになったら、会員登録のメールアドレスに「ご注文完了」メールを送る。
// コンビニ払いはサイトに戻らないため、決済画面を終えた時点でお支払い番号の案内メールを送る。
// - charge.refunded：返金額を注文に記録する（管理画面からの返金も、Stripe のダッシュボードからの返金も）。
// プレビューの追加枠の購入（metadata.kind = "credits"）は、支払い済みになったら枠を足す。
export async function POST(request: Request) {
  const stripe = getStripe();
  const db = getSupabase();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !db || !secret) return new Response("not configured", { status: 503 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
    const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

    if (session.metadata?.kind === "credits") {
      const purchaseId = session.metadata.purchase_id;
      if (purchaseId && paid) {
        const { error } = await db.rpc("add_preview_credits", { p_purchase: purchaseId });
        if (error) {
          console.error("add credits failed", error);
          return new Response("db error", { status: 500 });
        }
      }
      return new Response("ok");
    }

    const orderId = session.metadata?.order_id;
    if (orderId) {
      const { data: updated, error } = await db
        .from("orders")
        .update({
          checkout_completed_at: new Date(event.created * 1000).toISOString(),
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
        return new Response("db error", { status: 500 });
      }
      // 支払い済みになった通知のときだけ（同じ注文で二重に送らない）、ご注文完了メールを送る
      if (paid && updated?.length) {
        await sendOrderConfirmation(orderId, siteUrl(request)).catch((e) => console.error("order mail failed", e));
      }
      if (!paid && event.type === "checkout.session.completed" && updated?.length) {
        await sendKonbiniGuide(orderId, siteUrl(request)).catch((e) => console.error("konbini mail failed", e));
      }
    }
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (paymentIntent) {
      const { error } = await db
        .from("orders")
        .update({ refunded_amount: charge.amount_refunded, refunded_at: new Date(event.created * 1000).toISOString() })
        .eq("stripe_payment_intent", paymentIntent);
      if (error) {
        console.error("refund sync failed", error);
        return new Response("db error", { status: 500 });
      }
    }
  }
  return new Response("ok");
}
