import { randomUUID } from "node:crypto";
import { getSize, getStory, orderTotal, type SizeId } from "@/lib/catalog";
import { isDemoId, loadDraft } from "@/lib/drafts";
import { getStripe, getSupabase, siteUrl } from "@/lib/services";

// サイズ選択後に呼ぶ。金額はサーバー側で計算し、Stripe の決済画面へのURLを返す。
// お届け先・電話番号・メールアドレスは Stripe の画面で入力してもらう。
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const draftId = String(body?.draftId ?? "");
  const sizeId = String(body?.size ?? "") as SizeId;
  const extraCopy = body?.extraCopy === true;

  const size = getSize(sizeId);
  const draft = draftId ? await loadDraft(draftId) : null;
  if (!size || !draft) return Response.json({ error: "注文内容を確認できませんでした" }, { status: 400 });

  const amount = orderTotal(size.id, extraCopy);
  const base = siteUrl(request);
  const db = getSupabase();
  const stripe = getStripe();

  if (!db || !stripe || isDemoId(draftId)) {
    // デモモード：決済せずに完了画面へ
    return Response.json({ url: `${base}/create/done?order=DEMO`, demo: true });
  }

  const orderId = randomUUID();
  const { error } = await db.from("orders").insert({
    id: orderId,
    draft_id: draft.id,
    size: size.id,
    extra_copy: extraCopy,
    amount,
    status: "pending",
  });
  if (error) {
    console.error("order insert failed", error);
    return Response.json({ error: "注文の作成に失敗しました" }, { status: 500 });
  }

  const story = getStory(draft.story)!;
  const lineItems = [
    {
      quantity: 1,
      price_data: {
        currency: "jpy",
        unit_amount: size.price,
        product_data: { name: `絵本「${story.name}」${size.name}サイズ（${size.spec}）` },
      },
    },
  ];
  if (extraCopy) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: "jpy",
        unit_amount: amount - size.price,
        product_data: { name: "追加の1冊（Mサイズ・同梱）" },
      },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    locale: "ja",
    line_items: lineItems,
    shipping_address_collection: { allowed_countries: ["JP"] },
    phone_number_collection: { enabled: true },
    client_reference_id: orderId,
    metadata: { order_id: orderId },
    success_url: `${base}/create/done?order=${orderId}`,
    cancel_url: `${base}/create/size`,
  });

  await db.from("orders").update({ stripe_session_id: session.id }).eq("id", orderId);
  return Response.json({ url: session.url });
}
