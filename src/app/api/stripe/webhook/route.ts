import type Stripe from "stripe";
import { getStripe, getSupabase } from "@/lib/services";

// Stripe からの通知。
// - checkout.session.completed：お届け先を保存。カードなどその場で払えた場合は「支払い済み」にする。
// - checkout.session.async_payment_succeeded：コンビニ払いなど、後から支払いが済んだとき「支払い済み」にする。
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
    const orderId = session.metadata?.order_id;
    if (orderId) {
      const paid = session.payment_status === "paid";
      const { error } = await db
        .from("orders")
        .update({
          checkout_completed_at: new Date(event.created * 1000).toISOString(),
          email: session.customer_details?.email ?? null,
          phone: session.customer_details?.phone ?? null,
          shipping: session.collected_information?.shipping_details ?? null,
          amount: session.amount_total,
          ...(paid ? { status: "paid", paid_at: new Date().toISOString() } : {}),
        })
        .eq("id", orderId)
        .eq("status", "pending");
      if (error) {
        console.error("order update failed", error);
        return new Response("db error", { status: 500 });
      }
    }
  }
  return new Response("ok");
}
