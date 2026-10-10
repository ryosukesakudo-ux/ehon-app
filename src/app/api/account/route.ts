import { MEMBER_MONTHLY_PREVIEWS } from "@/lib/catalog";
import { authKeys, currentUser } from "@/lib/auth";
import { previewQuota } from "@/lib/account";

// 画面側でログイン状態とプレビューの残り枚数を知るために呼ぶ。
export async function GET() {
  if (!authKeys()) return Response.json({ configured: false, loggedIn: false });
  const user = await currentUser();
  if (!user) return Response.json({ configured: true, loggedIn: false });
  return Response.json({
    configured: true,
    loggedIn: true,
    email: user.email,
    ...(await previewQuota(user.id)),
    limit: MEMBER_MONTHLY_PREVIEWS,
  });
}
