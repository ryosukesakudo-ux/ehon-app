import { getSupabase } from "@/lib/services";

// 発送したら呼ぶ。
export async function POST(_request: Request, ctx: RouteContext<"/api/admin/orders/[id]/ship">) {
  const { id } = await ctx.params;
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定です" }, { status: 503 });
  const { data } = await db
    .from("orders")
    .update({ status: "shipped", shipped_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "generated")
    .select("id");
  if (!data?.length) return Response.json({ error: "制作完了の注文ではありません" }, { status: 400 });
  return Response.json({ ok: true });
}
