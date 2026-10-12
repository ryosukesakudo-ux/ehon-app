import { randomUUID } from "node:crypto";
import { MAX_PACKS, PREVIEW_PACK } from "@/lib/catalog";
import { currentUser } from "@/lib/auth";
import { getStripe, getSupabase, siteUrl } from "@/lib/services";

// プレビューの追加枠（PREVIEW_PACK.credits 枚を PREVIEW_PACK.price 円）を買う。Stripe の決済画面へのURLを返す。
// 本文を12枚まとめて作るときなど、足りない分に合わせて何セットか（packs・最大3）まとめて買える。
// 枠は支払いが済んだら Stripe の通知（/api/stripe/webhook）で足す。
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const back = String(body?.returnTo ?? "");
  const returnTo = back.startsWith("/") && !back.startsWith("//") ? back : "/account";
  const packs = Math.min(MAX_PACKS, Math.max(1, Math.floor(Number(body?.packs)) || 1));

  const user = await currentUser();
  if (!user) return Response.json({ error: "追加購入には無料会員登録（ログイン）が必要です", needLogin: true }, { status: 401 });
  const db = getSupabase();
  const stripe = getStripe();
  if (!db || !stripe) return Response.json({ error: "決済の準備がまだできていません（デモモード）" }, { status: 503 });

  const purchaseId = randomUUID();
  const { error } = await db
    .from("credit_purchases")
    .insert({ id: purchaseId, user_id: user.id, credits: PREVIEW_PACK.credits * packs, amount: PREVIEW_PACK.price * packs });
  if (error) {
    console.error("credit purchase insert failed", error);
    return Response.json({ error: "購入の準備に失敗しました" }, { status: 500 });
  }

  const base = siteUrl(request);
  const sep = returnTo.includes("?") ? "&" : "?";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    locale: "ja",
    line_items: [
      {
        quantity: packs,
        price_data: {
          currency: "jpy",
          unit_amount: PREVIEW_PACK.price,
          product_data: { name: `プレビュー追加 ${PREVIEW_PACK.credits}枚（使い切るまで有効）` },
        },
      },
    ],
    client_reference_id: purchaseId,
    customer_email: user.email ?? undefined,
    metadata: { kind: "credits", purchase_id: purchaseId },
    success_url: `${base}${returnTo}${sep}credits=done`,
    cancel_url: `${base}${returnTo}`,
  });

  await db.from("credit_purchases").update({ stripe_session_id: session.id }).eq("id", purchaseId);
  return Response.json({ url: session.url });
}
