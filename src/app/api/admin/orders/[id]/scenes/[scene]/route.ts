import { bookScenes, characterOf } from "@/lib/catalog";
import { standInsForOrder } from "@/lib/stand-ins";
import { getBook } from "@/lib/book";
import { finalFromPreview, generateScene, loadDraft } from "@/lib/drafts";
import { getSupabase } from "@/lib/services";
import { SERIES_NOTE_MAX } from "@/lib/series";

export const maxDuration = 300;

// 管理画面から、支払い済みの注文の挿絵を印刷用の高画質で作る（1場面ずつ）。
// 制作完了のあとでも、発送前なら1ページずつ作り直せる（2026-10-11 森3話の絵の不具合の作り直し用）。
// 「全ページの絵を作る」（reuse: true）では、お客様がプレビューで作った表紙・本文の絵をそのまま使い、無いページだけ描く（2026-10-12 作道さん）。
export async function POST(request: Request, ctx: RouteContext<"/api/admin/orders/[id]/scenes/[scene]">) {
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
  // ママ・パパの代わりの人がいる注文（stand-ins.ts）は、その人のキャラクターの絵も作り直せる（大人の絵になっていたため）
  const who = characterOf(sceneIndex);
  const standIn = who && who !== "child" && standInsForOrder(id)?.[who];
  if (!draft || !story || !(bookScenes().includes(sceneIndex) || standIn)) {
    return Response.json({ error: "場面が見つかりません" }, { status: 400 });
  }

  try {
    // 作り直しのときは、管理画面で書いた指示（日本語でよい）を絵の指示に足す。画質は中画質が標準で、高画質も選べる
    const body = await request.json().catch(() => ({}));
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, SERIES_NOTE_MAX) : "";
    const detail = body?.detail === "high" ? "high" : "medium";
    if (body?.reuse === true && !note) {
      const reused = await finalFromPreview(draft, sceneIndex);
      if (reused) return Response.json({ url: reused, reused: true });
    }
    const url = await generateScene(draft, sceneIndex, "final", note ? { options: [], note } : null, detail);
    return Response.json({ url });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "生成に失敗しました" }, { status: 500 });
  }
}
