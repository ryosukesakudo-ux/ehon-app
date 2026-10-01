import { currentUser } from "@/lib/auth";
import { claimAnonData } from "@/lib/claim";

// パスワードでログインした直後にブラウザから呼ぶ（メールのリンクや Google は /auth/callback で同じ処理をする）。
export async function POST() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "ログインしていません" }, { status: 401 });
  await claimAnonData(user.id);
  return Response.json({ ok: true });
}
