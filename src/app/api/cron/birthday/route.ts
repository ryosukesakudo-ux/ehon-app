import { BIRTHDAY_NOTICE_DAYS, jstDate } from "@/lib/catalog";
import { sendBirthdayNotice } from "@/lib/birthday-mail";
import { mailConfigured } from "@/lib/mail";
import { getSupabase, siteUrl } from "@/lib/services";

// 毎日実行（vercel.json、日本時間の朝9時）。お誕生日がちょうど1か月後（30日後）のお子さまの会員に、
// 続編のご案内メール（リピート割引のクーポン付き）を送る。同じお子さまには1年に1回まで。
export const maxDuration = 300;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const db = getSupabase();
  if (!db) return Response.json({ skipped: "demo" });
  if (!mailConfigured()) return Response.json({ skipped: "mail not configured" });

  const target = jstDate(BIRTHDAY_NOTICE_DAYS); // YYYY-MM-DD
  const year = Number(target.slice(0, 4));
  const days = [target.slice(5)];
  // うるう年でない年は、2月29日生まれの子に2月28日のぶんで送る
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (days[0] === "02-28" && !leap) days.push("02-29");

  const { data: targets, error } = await db.rpc("birthday_targets", { p_days: days, p_year: year });
  if (error) {
    console.error("birthday targets failed", error);
    return Response.json({ error: "db error" }, { status: 500 });
  }
  const base = siteUrl(request);
  const result = { sent: 0, skipped: 0, errors: 0 };
  for (const t of (targets ?? []) as { user_id: string; child_name: string; child_birthday: string }[]) {
    try {
      const { data } = await db.auth.admin.getUserById(t.user_id);
      const to = data.user?.email;
      if (!to) {
        result.skipped++;
        continue;
      }
      // 先に記録してから送る（同じ日に二重に動いても二度送らない）
      const { error: dup } = await db.from("birthday_notices").insert({ user_id: t.user_id, child_name: t.child_name, year });
      if (dup) {
        result.skipped++;
        continue;
      }
      const age = year - Number(t.child_birthday.slice(0, 4));
      await sendBirthdayNotice({ to, userId: t.user_id, childName: t.child_name, age, base });
      result.sent++;
    } catch (e) {
      console.error("birthday notice failed", t.user_id, e);
      result.errors++;
    }
  }
  return Response.json(result);
}
