import type Stripe from "stripe";
import { getStripe, getSupabase, siteUrl } from "@/lib/services";
import { applyCheckoutSession } from "@/lib/order-sync";

// Stripe からの通知。
// - checkout.session.completed：お届け先を保存。その場で払えた場合は「支払い済み」にする（中身は order-sync.ts）。
// - checkout.session.async_payment_succeeded：コンビニ払いなど、後から支払いが済んだとき「支払い済み」にする。
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

    const { ok } = await applyCheckoutSession(session, siteUrl(request), {
      at: new Date(event.created * 1000),
      firstNotice: event.type === "checkout.session.completed",
    });
    if (!ok) return new Response("db error", { status: 500 });
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (paymentIntent) {
      const at = new Date(event.created * 1000).toISOString();
      const { data: orders } = await db.from("orders").select("id, bundle_of, amount").eq("stripe_payment_intent", paymentIntent);
      if ((orders?.length ?? 0) > 1) {
        // まとめ買い（1回の支払いで話ごとに注文がある）：返金を注文ごとに分ける。管理画面からの返金は metadata.order_id で、
        // それ以外（Stripe のダッシュボードからの返金）は1話目の注文に数える
        const first = orders!.find((o) => !o.bundle_of) ?? orders![0];
        const refunds = await stripe.refunds.list({ payment_intent: paymentIntent, limit: 100 });
        const per = new Map<string, number>();
        for (const r of refunds.data) {
          if (r.status === "failed" || r.status === "canceled") continue;
          const id = orders!.some((o) => o.id === r.metadata?.order_id) ? r.metadata!.order_id : first.id;
          per.set(id, (per.get(id) ?? 0) + r.amount);
        }
        for (const o of orders!) {
          const { error } = await db.from("orders").update({ refunded_amount: per.get(o.id) ?? 0, ...(per.get(o.id) ? { refunded_at: at } : {}) }).eq("id", o.id);
          if (error) {
            console.error("refund sync failed", error);
            return new Response("db error", { status: 500 });
          }
        }
      } else {
        const { error } = await db
          .from("orders")
          .update({ refunded_amount: charge.amount_refunded, refunded_at: at })
          .eq("stripe_payment_intent", paymentIntent);
        if (error) {
          console.error("refund sync failed", error);
          return new Response("db error", { status: 500 });
        }
      }
    }
  }
  return new Response("ok");
}
