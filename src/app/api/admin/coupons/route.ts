import { REPEAT_COUPON } from "@/lib/catalog";
import { normalizeCouponCode } from "@/lib/coupons";
import { getSupabase } from "@/lib/services";

// クーポンを発行する。body: { code, label, bookPrice: 1冊目の値段（0 なら無料） }
export async function POST(request: Request) {
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定です" }, { status: 503 });
  const body = await request.json().catch(() => null);
  const code = normalizeCouponCode(body?.code);
  const label = String(body?.label ?? "").trim();
  const bookPrice = Math.floor(Number(body?.bookPrice));
  if (!/^[A-Z0-9-]{4,32}$/.test(code)) return Response.json({ error: "コードは英数字とハイフンで4〜32文字にしてください" }, { status: 400 });
  if (code === REPEAT_COUPON.code) return Response.json({ error: `「${REPEAT_COUPON.code}」はリピート割引で使っているコードです` }, { status: 400 });
  if (!label) return Response.json({ error: "名前（例：友人用1500円）を入れてください" }, { status: 400 });
  if (!(bookPrice >= 0)) return Response.json({ error: "1冊目の値段を0円以上で入れてください" }, { status: 400 });
  const { error } = await db.from("coupons").insert({ code, label, book_price: bookPrice });
  if (error) {
    return Response.json({ error: error.code === "23505" ? "同じコードがすでにあります" : "発行に失敗しました" }, { status: 400 });
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
