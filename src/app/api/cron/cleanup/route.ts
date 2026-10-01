import { RETENTION } from "@/lib/catalog";
import { deletePhoto } from "@/lib/account";
import { deleteDraftImages, deleteDraftPhotos } from "@/lib/drafts";
import { getSupabase } from "@/lib/services";

// 毎日実行（vercel.json）。保管期間を過ぎた写真と絵を削除する。
// - 登録前のお試しの写真：3日（その間に会員登録されれば会員の写真になる）
// - 会員の写真：最後に使ってから1年
// - 注文されなかった下書きの絵：30日
// - 支払い済みの注文の絵：支払いから100日（制作・発送が済んだものだけ）
export const maxDuration = 300;

const DAY = 24 * 60 * 60 * 1000;
const BATCH = 200;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const db = getSupabase();
  if (!db) return Response.json({ skipped: "demo" });
  const result = { anonPhotos: 0, memberPhotos: 0, unpaidImages: 0, paidImages: 0, errors: 0 };

  // 1. 登録前のお試しの写真
  const { data: anon } = await db
    .from("drafts")
    .select("id, child_photo_path, mom_photo_path")
    .is("user_id", null)
    .is("photos_deleted_at", null)
    .lt("created_at", ago(RETENTION.anonPhotoDays))
    .limit(BATCH);
  for (const d of anon ?? []) {
    try {
      await deleteDraftPhotos(d);
      result.anonPhotos++;
    } catch (e) {
      console.error("anon photo cleanup failed", d.id, e);
      result.errors++;
    }
  }

  // 2. 1年使っていない会員の写真（制作中の注文で使っているものは deletePhoto が残す）
  const { data: idle } = await db
    .from("user_photos")
    .select("id")
    .lt("last_used_at", ago(RETENTION.photoIdleDays))
    .limit(BATCH);
  for (const p of idle ?? []) {
    const r = await deletePhoto(null, p.id);
    if ("ok" in r) result.memberPhotos++;
  }

  // 3. 注文されなかった下書きの絵
  const { data: unpaid } = await db
    .from("drafts")
    .select("id, orders(paid_at)")
    .is("images_deleted_at", null)
    .lt("created_at", ago(RETENTION.unpaidImageDays))
    .limit(BATCH);
  for (const d of unpaid ?? []) {
    if ((d.orders as { paid_at: string | null }[] | null)?.some((o) => o.paid_at)) continue;
    try {
      await deleteDraftImages(d.id);
      result.unpaidImages++;
    } catch (e) {
      console.error("unpaid image cleanup failed", d.id, e);
      result.errors++;
    }
  }

  // 4. 支払いから100日たった注文の絵（制作完了・発送済みのもの）
  const { data: paid } = await db
    .from("orders")
    .select("draft_id, drafts!inner(images_deleted_at)")
    .in("status", ["generated", "shipped"])
    .lt("paid_at", ago(RETENTION.paidImageDays))
    .is("drafts.images_deleted_at", null)
    .limit(BATCH);
  for (const o of paid ?? []) {
    try {
      await deleteDraftImages(o.draft_id);
      result.paidImages++;
    } catch (e) {
      console.error("paid image cleanup failed", o.draft_id, e);
      result.errors++;
    }
  }

  return Response.json(result);
}
