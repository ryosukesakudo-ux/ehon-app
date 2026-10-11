import { bookScenes } from "@/lib/catalog";
import { getBook } from "@/lib/book";
import { generateScene, loadDraft } from "@/lib/drafts";
import { getSupabase } from "@/lib/services";

export const maxDuration = 300;

// 管理画面から、支払い済みの注文の挿絵を印刷用の高画質で作る（1場面ずつ）。
// 制作完了のあとでも、発送前なら1ページずつ作り直せる（2026-10-11 森3話の絵の不具合の作り直し用）。
export async function POST(_request: Request, ctx: RouteContext<"/api/admin/orders/[id]/scenes/[scene]">) {
  const { id, scene } = await ctx.params;
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定です" }, { status: 503 });

  const { data: order } = await db.from("orders").select("draft_id, status").eq("id", id).maybeSingle();
  if (!order || (order.status !== "paid" && order.status !== "generated")) {
    return Response.json({ error: "支払い済み・発送前の注文ではありません" }, { status: 400 });
  }
  const draft = await loadDraft(order.draft_id);
  const sceneIndex = Number(scene);
  const story = draft && getBook(draft.story);
  if (!draft || !story || !bookScenes().includes(sceneIndex)) {
    return Response.json({ error: "場面が見つかりません" }, { status: 400 });
  }

  try {
    const url = await generateScene(draft, sceneIndex, "final");
    return Response.json({ url });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "生成に失敗しました" }, { status: 500 });
  }
}
