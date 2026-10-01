import { getSupabase } from "@/lib/services";

// 全ページの絵ができたら呼ぶ。注文を「制作完了」にする。
// 顔写真は会員の写真として残す（マイページから削除でき、1年使わなければ自動削除）。
export async function POST(_request: Request, ctx: RouteContext<"/api/admin/orders/[id]/complete">) {
  const { id } = await ctx.params;
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定です" }, { status: 503 });

  const { data: order } = await db.from("orders").select("draft_id, status").eq("id", id).maybeSingle();
  if (!order || order.status !== "paid") {
    return Response.json({ error: "支払い済みの注文ではありません" }, { status: 400 });
  }
  await db.from("orders").update({ status: "generated", generated_at: new Date().toISOString() }).eq("id", id);
  return Response.json({ ok: true });
}
