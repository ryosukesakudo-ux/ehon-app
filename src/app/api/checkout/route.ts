import { randomUUID } from "node:crypto";
import {
  DELIVERY_MAX_DAYS,
  DELIVERY_MIN_DAYS,
  DELIVERY_TIMES,
  clampCopies,
  extraCopyPrice,
  firstBookPrice,
  deliveryLabel,
  getSize,
  getStory,
  jstDate,
  orderTotal,
  parseBirthday,
  type SizeId,
} from "@/lib/catalog";
import { findCoupon, normalizeCouponCode, type Coupon } from "@/lib/coupons";
import { isDemoId, loadOwnedDraft } from "@/lib/drafts";
import { getStripe, getSupabase, siteUrl } from "@/lib/services";

// サイズ選択後に呼ぶ。金額はサーバー側で計算し、Stripe の決済画面へのURLを返す。
// お届け先・電話番号・メールアドレスは Stripe の画面で入力してもらう。
// 支払い方法（カード・Apple Pay・Google Pay・コンビニ・PayPay など）は Stripe のダッシュボードで選ぶ。
// 注文は会員のみ（デモモードを除く）。クーポンは1冊目の値段を変える（2冊目以降は通常の値段）。
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const draftId = String(body?.draftId ?? "");
  const sizeId = String(body?.size ?? "") as SizeId;
  const copies = clampCopies(body?.copies);
  const deliveryDate = String(body?.deliveryDate ?? "") || null;
  const deliveryTime = String(body?.deliveryTime ?? "") || null;
  // お誕生日は任意。入っていれば、誕生日の1か月前に続編のご案内メールを送る
  const childBirthday = parseBirthday(body?.childBirthday);
  if (deliveryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) || deliveryDate < jstDate(DELIVERY_MIN_DAYS) || deliveryDate > jstDate(DELIVERY_MAX_DAYS))) {
    return Response.json({ error: `お届け日は${DELIVERY_MIN_DAYS}日後から${DELIVERY_MAX_DAYS}日後までの日付を選んでください` }, { status: 400 });
  }
  if (deliveryTime && !DELIVERY_TIMES.some((t) => t.id === deliveryTime)) {
    return Response.json({ error: "お届けの時間帯を選び直してください" }, { status: 400 });
  }

  const size = getSize(sizeId);
  const owned = draftId ? await loadOwnedDraft(draftId) : null;
  if (!size || !owned) return Response.json({ error: "注文内容を確認できませんでした" }, { status: 400 });
  const { draft, user } = owned;

  const couponCode = normalizeCouponCode(body?.coupon);
  const base = siteUrl(request);
  const db = getSupabase();
  const stripe = getStripe();

  if (!db || !stripe || isDemoId(draftId)) {
    // デモモード：決済せずに完了画面へ
    return Response.json({ url: `${base}/create/done?order=DEMO`, demo: true });
  }

  if (!user) {
    return Response.json({ error: "ご注文には無料会員登録（ログイン）が必要です", needLogin: true }, { status: 401 });
  }

  let coupon: Coupon | null = null;
  if (couponCode) {
    const found = await findCoupon(couponCode, user.id);
    if ("error" in found) return Response.json({ error: found.error }, { status: 400 });
    coupon = found.coupon;
  }
  const firstPrice = firstBookPrice(size.price, coupon);
  const amount = orderTotal(size.id, copies, firstPrice);

  const orderId = randomUUID();
  const row = {
    id: orderId,
    user_id: user.id,
    draft_id: draft.id,
    size: size.id,
    extra_copy: copies > 1,
    copies,
    amount,
    status: "pending",
    delivery_date: deliveryDate,
    delivery_time: deliveryTime,
    coupon_code: coupon?.code ?? null,
    discount: size.price - firstPrice,
    child_birthday: childBirthday,
  };
  let { error } = await db.from("orders").insert(row);
  if (error?.code === "42703") {
    // schema.sql の再実行前で copies・クーポン・お誕生日の列がまだない場合（部数は extra_copy と金額から分かる）
    if (coupon) return Response.json({ error: "クーポンの準備がまだできていません" }, { status: 503 });
    const oldColumns: Partial<typeof row> = { ...row };
    delete oldColumns.copies;
    delete oldColumns.coupon_code;
    delete oldColumns.discount;
    delete oldColumns.child_birthday;
    ({ error } = await db.from("orders").insert(oldColumns));
  }
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
        unit_amount: firstPrice,
        product_data: {
          name: `絵本「${story.name}」${size.name}サイズ（${size.spec}）${coupon ? `・クーポン「${coupon.label}」適用` : ""}`,
        },
      },
    },
  ];
  if (copies > 1) {
    lineItems.push({
      quantity: copies - 1,
      price_data: {
        currency: "jpy",
        unit_amount: extraCopyPrice(size.id),
        product_data: { name: `追加の1冊（${size.name}サイズ・同梱）` },
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
    customer_email: user.email ?? undefined,
    metadata: { order_id: orderId, delivery: deliveryLabel(deliveryDate, deliveryTime) },
    custom_text: { submit: { message: `お届け希望：${deliveryLabel(deliveryDate, deliveryTime)}` } },
    success_url: `${base}/create/done?order=${orderId}`,
    cancel_url: `${base}/create/size`,
  });

  await db.from("orders").update({ stripe_session_id: session.id }).eq("id", orderId);
  return Response.json({ url: session.url });
}
