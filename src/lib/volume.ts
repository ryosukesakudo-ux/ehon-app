import "server-only";
import type { getSupabase } from "./services";

type Db = NonNullable<ReturnType<typeof getSupabase>>;

/**
 * 表紙に入れる巻数（Vol.1, Vol.2 …）。同じ会員の、同じ主人公の名前の支払い済みの注文を、支払いの順に数える。
 * 会員でない注文（デモなど）は Vol.1。
 */
export async function bookVolume(db: Db, order: { user_id: string | null; paid_at: string | null; drafts: { child_name: string } }) {
  if (!order.user_id || !order.paid_at) return 1;
  const { count } = await db
    .from("orders")
    .select("id, drafts!inner(child_name)", { count: "exact", head: true })
    .eq("user_id", order.user_id)
    .eq("drafts.child_name", order.drafts.child_name)
    .not("paid_at", "is", null)
    .lte("paid_at", order.paid_at);
  return Math.max(1, count ?? 1);
}
