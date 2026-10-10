import { currentUser } from "@/lib/auth";
import { findCoupon } from "@/lib/coupons";

// 注文確認画面でクーポンコードを確かめる。?code=XXXX
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "クーポンのご利用には無料会員登録（ログイン）が必要です", needLogin: true }, { status: 401 });
  const result = await findCoupon(new URL(request.url).searchParams.get("code"), user.id);
  if ("error" in result) return Response.json(result, { status: 400 });
  return Response.json(result.coupon);
}
