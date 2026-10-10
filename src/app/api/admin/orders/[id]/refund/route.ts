import { getStripe, getSupabase } from "@/lib/services";

// 返金する（全額・一部）。body: { amount: 返金する金額（円） }
// 返金は Stripe で行い、返金額の合計を注文に記録する（Stripe からの通知 charge.refunded でも同じ値に揃う）。
export async function POST(request: Request, ctx: RouteContext<"/api/admin/orders/[id]/refund">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const amount = Math.floor(Number(body?.amount));
  const db = getSupabase();
  const stripe = getStripe();
  if (!db || !stripe) return Response.json({ error: "Supabase または Stripe が未設定です" }, { status: 503 });

  const { data: order } = await db.from("orders").select("*").eq("id", id).maybeSingle();
  if (!order?.paid_at) return Response.json({ error: "支払い済みの注文ではありません" }, { status: 400 });
  const refundable = order.amount - (order.refunded_amount ?? 0);
  if (!(amount >= 1 && amount <= refundable)) {
    return Response.json({ error: `返金できるのは1円〜${refundable}円です` }, { status: 400 });
  }

  // 以前の注文は決済ID（payment_intent）を保存していないので、決済画面の記録から探す
  let paymentIntent: string | null = order.stripe_payment_intent ?? null;
  if (!paymentIntent && order.stripe_session_id) {
    const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
    paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
  }
  if (!paymentIntent) return Response.json({ error: "Stripe の決済が見つかりません（0円の注文は返金できません）" }, { status: 400 });

  try {
    await stripe.refunds.create({ payment_intent: paymentIntent, amount, metadata: { order_id: id } });
  } catch (e) {
    console.error("refund failed", e);
    return Response.json({ error: `Stripe で返金できませんでした：${e instanceof Error ? e.message : ""}` }, { status: 502 });
  }

  const refunded = (order.refunded_amount ?? 0) + amount;
  await db
    .from("orders")
    .update({ refunded_amount: refunded, refunded_at: new Date().toISOString(), stripe_payment_intent: paymentIntent })
    .eq("id", id);
  return Response.json({ ok: true, refunded });
}
