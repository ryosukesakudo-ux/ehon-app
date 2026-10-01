import { getStripe, getSupabase } from "@/lib/services";

// Stripe からの支払い完了通知。注文を「支払い済み」にし、お届け先を保存する。
export async function POST(request: Request) {
  const stripe = getStripe();
  const db = getSupabase();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !db || !secret) return new Response("not configured", { status: 503 });

  const payload = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session.metadata?.order_id;
    if (orderId && session.payment_status === "paid") {
      const { error } = await db
        .from("orders")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          email: session.customer_details?.email ?? null,
          phone: session.customer_details?.phone ?? null,
          shipping: session.collected_information?.shipping_details ?? null,
          amount: session.amount_total,
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
