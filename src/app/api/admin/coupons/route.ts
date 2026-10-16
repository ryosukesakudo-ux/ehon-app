import { FLYER_COUPON, REPEAT_COUPON, REVIEW_COUPON } from "@/lib/catalog";
import { normalizeCouponCode } from "@/lib/coupons";
import { getSupabase } from "@/lib/services";

// クーポンを発行する。body: { code, label, kind: "price"（1冊目の値段・0 なら無料）| "discount"（値引き額）, amount, multiUse }
export async function POST(request: Request) {
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定です" }, { status: 503 });
  const body = await request.json().catch(() => null);
  const code = normalizeCouponCode(body?.code);
  const label = String(body?.label ?? "").trim();
  const kind = body?.kind === "discount" ? "discount" : "price";
  const amount = Math.floor(Number(body?.amount ?? body?.bookPrice));
  const multiUse = !!body?.multiUse;
  if (!/^[A-Z0-9-]{4,32}$/.test(code)) return Response.json({ error: "コードは英数字とハイフンで4〜32文字にしてください" }, { status: 400 });
  if (code === REPEAT_COUPON.code) return Response.json({ error: `「${REPEAT_COUPON.code}」はリピート割引で使っているコードです` }, { status: 400 });
  if (code === FLYER_COUPON.code) return Response.json({ error: `「${FLYER_COUPON.code}」はチラシ割引で使っているコードです` }, { status: 400 });
  if (code.startsWith(REVIEW_COUPON.prefix)) return Response.json({ error: `「${REVIEW_COUPON.prefix}」で始まるコードはレビューのお礼クーポンで使っています` }, { status: 400 });
  if (!label) return Response.json({ error: "名前（例：友人用1500円）を入れてください" }, { status: 400 });
  if (kind === "price" && !(amount >= 0)) return Response.json({ error: "1冊目の値段を0円以上で入れてください" }, { status: 400 });
  if (kind === "discount" && !(amount > 0)) return Response.json({ error: "値引き額を1円以上で入れてください" }, { status: 400 });
  const row: { code: string; label: string; book_price: number | null; discount?: number; multi_use?: boolean } = kind === "discount" ? { code, label, book_price: null, discount: amount } : { code, label, book_price: amount };
  const { error } = await db.from("coupons").insert(multiUse ? { ...row, multi_use: true } : row);
  if (error) {
    // 値引き・何回でも使えるクーポンは、schema.sql の再実行（列の追加）が必要
    const needSql = error.code === "PGRST204" || error.code === "42703" || error.code === "23502";
    const message = error.code === "23505" ? "同じコードがすでにあります"
      : needSql ? "Supabase の SQL Editor で schema.sql を実行してから発行してください" : "発行に失敗しました";
    return Response.json({ error: message }, { status: 400 });
  }
  return Response.json({ ok: true });
}

// 使える・使えないを切り替える。body: { code, active }
export async function PATCH(request: Request) {
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定です" }, { status: 503 });
  const body = await request.json().catch(() => null);
  const { error } = await db.from("coupons").update({ active: !!body?.active }).eq("code", normalizeCouponCode(body?.code));
  if (error) return Response.json({ error: "変更に失敗しました" }, { status: 500 });
  return Response.json({ ok: true });
}
