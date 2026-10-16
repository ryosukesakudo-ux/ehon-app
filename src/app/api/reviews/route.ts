import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { SITE_NAME } from "@/components/brand";
import { REVIEW_COUPON, yen } from "@/lib/catalog";
import { currentUser } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { REVIEW_LIMITS, listPublicReviews, newReviewCouponCode, removeReviewPhoto, reviewPhotoPath } from "@/lib/reviews";
import { SAMPLE_BUCKET, getSupabase, siteUrl } from "@/lib/services";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

// 公開中のレビュー（トップの欄が読む）
export async function GET(request: Request) {
  const limit = Math.min(50, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 3));
  return Response.json({ reviews: await listPublicReviews(limit) });
}

// レビューを投稿する（届いた注文の持ち主だけ、1注文1件）。投稿したらすぐ公開し、お礼のクーポンを発行する
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return bad("ログインが必要です", 401);
  const db = getSupabase();
  if (!db) return bad("デモモードではレビューを投稿できません", 503);

  const form = await request.formData();
  const orderId = String(form.get("order") ?? "");
  const nickname = String(form.get("nickname") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const rating = Math.floor(Number(form.get("rating")));
  const photo = form.get("photo");
  const consent = form.get("consent") === "1";

  if (!nickname) return bad("お名前（ニックネーム）を入れてください");
  if (nickname.length > REVIEW_LIMITS.nickname) return bad(`お名前は${REVIEW_LIMITS.nickname}文字までにしてください`);
  if (!(rating >= 1 && rating <= 5)) return bad("星の数をえらんでください");
  if (body.length < REVIEW_LIMITS.bodyMin) return bad(`ご感想は${REVIEW_LIMITS.bodyMin}文字以上で書いてください`);
  if (body.length > REVIEW_LIMITS.bodyMax) return bad(`ご感想は${REVIEW_LIMITS.bodyMax}文字までにしてください`);
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (hasPhoto) {
    if (!PHOTO_TYPES.has(photo.type)) return bad("写真は JPEG・PNG・WebP でアップロードしてください");
    if (photo.size > MAX_PHOTO_BYTES) return bad("写真は10MB以下にしてください");
    if (!consent) return bad("写真を載せるには、一般公開への同意が必要です");
  }

  const { data: order } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order || order.user_id !== user.id) return bad("ご注文が見つかりません", 404);
  // まとめ買いの2話目以降は、1話目の注文でまとめて1件（クーポンも1枚）
  if (order.bundle_of) return bad("まとめ買いのレビューは、1話目のご注文から1件だけ書けます");
  if (order.status !== "shipped") return bad("レビューは絵本がお手元に届いてから書けます");
  const { data: existing } = await db.from("reviews").select("id").eq("order_id", order.id).maybeSingle();
  if (existing) return bad("このご注文のレビューはもう投稿済みです", 409);

  const id = randomUUID();
  let photoPath: string | null = null;
  if (hasPhoto) {
    // 向きを直し、撮影場所などの情報（Exif）は消して、公開用に小さくする
    const webp = await sharp(Buffer.from(await photo.arrayBuffer()))
      .rotate()
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
      .catch(() => null);
    if (!webp) return bad("写真を読み込めませんでした。別の写真をお試しください");
    photoPath = reviewPhotoPath(id);
    const { error } = await db.storage.from(SAMPLE_BUCKET).upload(photoPath, webp, { contentType: "image/webp", upsert: true });
    if (error) {
      console.error("review photo upload failed", error);
      return bad("写真の保存に失敗しました。もう一度お試しください", 500);
    }
  }

  let coupon = "";
  let saved = false;
  for (let i = 0; i < 3 && !saved; i++) {
    coupon = newReviewCouponCode();
    const { error } = await db.from("reviews").insert({
      id,
      user_id: user.id,
      order_id: order.id,
      nickname,
      rating,
      body,
      photo_path: photoPath,
      photo_consent_at: photoPath ? new Date().toISOString() : null,
      coupon_code: coupon,
    });
    if (!error) saved = true;
    else if (error.code === "23505" && /order_id/.test(error.message)) {
      if (photoPath) await removeReviewPhoto(photoPath);
      return bad("このご注文のレビューはもう投稿済みです", 409);
    } else if (error.code !== "23505") {
      console.error("review insert failed", error);
      if (photoPath) await removeReviewPhoto(photoPath);
      return bad(error.code === "42P01" || error.code === "PGRST205" ? "レビューの準備がまだできていません" : "投稿に失敗しました。もう一度お試しください", 500);
    }
  }
  if (!saved) return bad("投稿に失敗しました。もう一度お試しください", 500);

  if (user.email) {
    const base = siteUrl(request);
    const text = [
      "お客様",
      "",
      `「${SITE_NAME}」にレビューを書いていただき、ありがとうございます。`,
      `お礼に、次のご注文で1冊目が${yen(REVIEW_COUPON.discount)}引きになるクーポンをお送りします。`,
      "",
      `クーポンコード：${coupon}`,
      "（このアカウントで1回だけお使いいただけます。注文の確認画面で入力してください）",
      "",
      `${SITE_NAME}`,
      base,
    ].join("\n");
    await sendMail(user.email, `【${SITE_NAME}】レビューのお礼のクーポン`, text).catch((e) => console.error("review mail failed", e));
  }

  return Response.json({ ok: true, coupon, discount: REVIEW_COUPON.discount });
}
