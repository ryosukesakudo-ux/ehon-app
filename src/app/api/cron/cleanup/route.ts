import { deleteDraftPhotos } from "@/lib/drafts";
import { getSupabase } from "@/lib/services";

// 毎日実行（vercel.json）。注文されずに放置された下書きの顔写真を削除する。
// 注文された写真は、管理画面で「制作完了」にした時点で削除される。
const ABANDONED_AFTER_DAYS = 3;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const db = getSupabase();
  if (!db) return Response.json({ deleted: 0 });

  const cutoff = new Date(Date.now() - ABANDONED_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: drafts, error } = await db
    .from("drafts")
    .select("id, child_photo_path, mom_photo_path, orders(status)")
    .is("photos_deleted_at", null)
    .lt("created_at", cutoff);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let deleted = 0;
  for (const d of drafts ?? []) {
    // 支払い済みで制作中の注文がある写真は残す
    const inProduction = (d.orders as { status: string }[] | null)?.some((o) => o.status === "paid");
    if (inProduction) continue;
    await deleteDraftPhotos(d);
    deleted++;
  }
  return Response.json({ deleted });
}
