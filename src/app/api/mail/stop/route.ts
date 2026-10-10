import { verifyStopToken } from "@/lib/birthday-mail";
import { getSupabase } from "@/lib/services";

// ご案内メールの配信停止（メールのリンクから開くページのボタンで送る）
export async function POST(request: Request) {
  const form = await request.formData();
  const userId = String(form.get("u") ?? "");
  const token = String(form.get("t") ?? "");
  const back = new URL("/mail/stop", request.url);
  if (!verifyStopToken(userId, token)) {
    back.searchParams.set("error", "1");
    return Response.redirect(back, 303);
  }
  const db = getSupabase();
  if (db) {
    const { error } = await db.from("mail_optouts").upsert({ user_id: userId });
    if (error) {
      console.error("mail optout failed", error);
      back.searchParams.set("error", "1");
      return Response.redirect(back, 303);
    }
  }
  back.searchParams.set("done", "1");
  return Response.redirect(back, 303);
}
