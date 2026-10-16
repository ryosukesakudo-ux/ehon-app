import { randomUUID } from "node:crypto";
import {
  DELIVERY_MAX_DAYS,
  DELIVERY_MIN_DAYS,
  clampCopies,
  extraCopyPrice,
  firstBookPrice,
  deliveryLabel,
  getSize,
  jstDate,
  orderTotal,
  parseBirthday,
  type SizeId,
} from "@/lib/catalog";
import { parseBookExtras, saveBookExtras } from "@/lib/book-extras";
import { findCoupon, normalizeCouponCode, type Coupon } from "@/lib/coupons";
import { isDemoId, loadOwnedDraft, memoryPhotoDir, type Draft } from "@/lib/drafts";
import { draftForEpisode, extraEpisodeChoices } from "@/lib/episode-bundle";
import { PHOTO_BUCKET, getStripe, getSupabase, siteUrl } from "@/lib/services";
import { storyLabel } from "@/lib/story-key";

// サイズ選択後に呼ぶ。金額はサーバー側で計算し、Stripe の決済画面へのURLを返す。
// お届け先・電話番号・メールアドレスは Stripe の画面で入力してもらう。
// 支払い方法（カード・Apple Pay・Google Pay・コンビニ・PayPay など）は Stripe のダッシュボードで選ぶ。
// 注文は会員のみ（デモモードを除く）。クーポンは1冊目の値段を変える（2冊目以降は通常の値段）。
// extraEpisodes：同じシリーズのほかの話もまとめて買う（2026-10-16）。話ごとに注文を作り、2話目以降は bundle_of に1話目の注文を入れる。
// extraDrafts：プレビューを作った話の下書き（話の番号 → 下書き）。無い話は、ここで下書きを写して作る
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const draftId = String(body?.draftId ?? "");
  const sizeId = String(body?.size ?? "") as SizeId;
  const copies = clampCopies(body?.copies);
  const deliveryDate = String(body?.deliveryDate ?? "") || null;
  // 製本直送は日時指定ができないため、時間帯は受け付けない
  const deliveryTime = null;
  // お誕生日は任意。入っていれば、誕生日の1か月前に続編のご案内メールを送る
  const childBirthday = parseBirthday(body?.childBirthday);
  if (deliveryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) || deliveryDate < jstDate(DELIVERY_MIN_DAYS) || deliveryDate > jstDate(DELIVERY_MAX_DAYS))) {
    return Response.json({ error: `お届け日は${DELIVERY_MIN_DAYS}日後から${DELIVERY_MAX_DAYS}日後までの日付を選んでください` }, { status: 400 });
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

  // まとめて買うほかの話（同じシリーズ・本番に出ている話だけ）
  const requested: number[] = Array.isArray(body?.extraEpisodes) ? [...new Set<number>(body.extraEpisodes.map((n: unknown) => Math.floor(Number(n))))] : [];
  const choices = requested.length ? await extraEpisodeChoices(draft.story) : [];
  if (requested.some((n) => !choices.includes(n))) return Response.json({ error: "選べないお話が含まれています。選び直してください" }, { status: 400 });
  const extraDraftIds = (body?.extraDrafts && typeof body.extraDrafts === "object" ? body.extraDrafts : {}) as Record<string, unknown>;
  const extraDrafts: { episode: number; draft: Draft }[] = [];
  for (const episode of requested.sort((a, b) => a - b)) {
    const d = await draftForEpisode(draft, episode, typeof extraDraftIds[episode] === "string" ? (extraDraftIds[episode] as string) : null);
    if (!d) return Response.json({ error: "注文の作成に失敗しました。もう一度お試しください" }, { status: 500 });
    extraDrafts.push({ episode, draft: d });
  }
  // 1話目の注文の金額（クーポンは1話目の1冊目）。2話目以降の注文は、部数×2冊目以降の値段
  const amount = orderTotal(size.id, copies, firstPrice);
  const extraAmount = copies * extraCopyPrice(size.id);

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
  // schema.sql の再実行前で新しい列がまだない場合は、新しい列から順に外して入れ直す
  // （列がないときのエラーは、PostgREST 経由だと PGRST204、データベース直だと 42703）
  const isMissingColumn = (e: { code?: string } | null) => e?.code === "PGRST204" || e?.code === "42703";
  let { error } = await db.from("orders").insert(row);
  if (isMissingColumn(error)) {
    const withoutBirthday: Partial<typeof row> = { ...row };
    delete withoutBirthday.child_birthday;
    ({ error } = await db.from("orders").insert(withoutBirthday));
  }
  if (isMissingColumn(error)) {
    // copies・クーポンの列もない場合（部数は extra_copy と金額から分かる）
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
  // 特別ページに入れる呼び方・メッセージ・思い出の写真（任意）
  const bookExtras = parseBookExtras(draft.id, body ?? {});
  try {
    await saveBookExtras(db, draft.id, orderId, bookExtras);
  } catch (e) {
    console.error("book extras save failed", e);
    return Response.json({ error: "注文の作成に失敗しました。もう一度お試しください" }, { status: 500 });
  }

  // 2話目以降の注文（同じ部数・同じ箱・同じ特別ページ）。思い出の写真はその話の下書きの置き場所に写す
  const extraOrderIds: string[] = [];
  for (const { draft: d } of extraDrafts) {
    const id = randomUUID();
    const { error: extraError } = await db.from("orders").insert({
      ...row,
      id,
      draft_id: d.id,
      amount: extraAmount,
      coupon_code: null,
      discount: 0,
      bundle_of: orderId,
    });
    if (extraError) {
      console.error("bundle order insert failed", extraError);
      await db.from("orders").delete().in("id", [orderId, ...extraOrderIds]);
      const missing = extraError.code === "PGRST204" || extraError.code === "42703";
      return Response.json({ error: missing ? "まとめ買いの準備がまだできていません" : "注文の作成に失敗しました" }, { status: missing ? 503 : 500 });
    }
    extraOrderIds.push(id);
    try {
      const memoryPhotoPaths: string[] = [];
      for (const from of bookExtras.memoryPhotoPaths) {
        const to = `${memoryPhotoDir(d.id)}/${from.split("/").pop()}`;
        const { error: copyError } = await db.storage.from(PHOTO_BUCKET).copy(from, to);
        if (!copyError || /exists/i.test(copyError.message)) memoryPhotoPaths.push(to);
      }
      await saveBookExtras(db, d.id, id, { ...bookExtras, memoryPhotoPaths });
    } catch (e) {
      console.error("book extras save failed", e);
      return Response.json({ error: "注文の作成に失敗しました。もう一度お試しください" }, { status: 500 });
    }
  }

  const lineItems = [
    {
      quantity: 1,
      price_data: {
        currency: "jpy",
        unit_amount: firstPrice,
        product_data: {
          name: `絵本「${storyLabel(draft.story)}」${size.name}（${size.spec}）${coupon ? `・クーポン「${coupon.label}」適用` : ""}`,
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
        product_data: { name: `追加の1冊（${size.name}・同梱）` },
      },
    });
  }

  for (const { draft: d } of extraDrafts) {
    lineItems.push({
      quantity: copies,
      price_data: {
        currency: "jpy",
        unit_amount: extraCopyPrice(size.id),
        product_data: { name: `絵本「${storyLabel(d.story)}」${size.name}（まとめ買い・同梱）` },
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
    metadata: { order_id: orderId, delivery: deliveryLabel(deliveryDate, deliveryTime), ...(extraOrderIds.length ? { bundle: String(extraOrderIds.length) } : {}) },
    custom_text: { submit: { message: `お届け希望：${deliveryLabel(deliveryDate, deliveryTime)}` } },
    success_url: `${base}/create/done?order=${orderId}`,
    cancel_url: `${base}/create/size`,
  });

  await db.from("orders").update({ stripe_session_id: session.id }).in("id", [orderId, ...extraOrderIds]);
  return Response.json({ url: session.url });
}
