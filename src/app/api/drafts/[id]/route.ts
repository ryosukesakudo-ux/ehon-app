import { deleteDraftImages, draftPreviewScenes, isDemoId, loadOwnedDraft, previewUrls } from "@/lib/drafts";
import { getFlowSave, putFlowSave } from "@/lib/flow-save";
import { getSupabase } from "@/lib/services";
import { customKey, parseCustomKey } from "@/lib/custom-story";

// 会員ページの「つづきから」で呼ぶ。下書きの内容と作成済みのプレビューを返す。
export async function GET(_request: Request, ctx: RouteContext<"/api/drafts/[id]">) {
  const { id } = await ctx.params;
  const owned = await loadOwnedDraft(id);
  if (!owned) return Response.json({ error: "下書きが見つかりません" }, { status: 404 });
  const { draft } = owned;
  return Response.json({
    taste: draft.taste,
    // オリジナルのお話は、サーバーで足した写真の保存先を除いて返す
    story: (() => {
      const custom = parseCustomKey(draft.story);
      return custom ? customKey(custom) : draft.story;
    })(),
    childName: draft.child_name,
    childAge: draft.child_age,
    previews: await previewUrls(draft.id),
    previewScenes: draftPreviewScenes(draft),
  });
}

// 会員ページの「この絵本を消す」。注文していない作りかけの絵本だけ消せる（2026-10-12 作道さん）。
// プレビューの絵は消す。写真と保存しているキャラクターは、ほかの絵本でも使うので残す。
export async function DELETE(_request: Request, ctx: RouteContext<"/api/drafts/[id]">) {
  const { id } = await ctx.params;
  const owned = await loadOwnedDraft(id);
  if (!owned || !owned.user) return Response.json({ error: "絵本が見つかりません" }, { status: 404 });
  const db = getSupabase();
  if (!db || isDemoId(id)) return Response.json({ ok: true });
  const { data: orders, error } = await db.from("orders").select("id, paid_at, checkout_completed_at").eq("draft_id", id);
  if (error) return Response.json({ error: "消せませんでした。時間をおいてもう一度お試しください" }, { status: 500 });
  if ((orders ?? []).some((o) => o.paid_at || o.checkout_completed_at)) {
    return Response.json({ error: "ご注文（お支払い待ちを含む）のある絵本は消せません" }, { status: 400 });
  }
  try {
    await deleteDraftImages(id);
    // 決済画面を開いただけで終わった注文の記録を消してから、絵本を消す
    if (orders?.length) await db.from("orders").delete().in("id", orders.map((o) => o.id));
    const { error: delError } = await db.from("drafts").delete().eq("id", id);
    // 消せなかったときは、マイページに出ないように持ち主から外す
    if (delError) await db.from("drafts").update({ user_id: null, anon_id: null }).eq("id", id);
    if ((await getFlowSave())?.draftId === id) await putFlowSave(null);
  } catch (e) {
    console.error("draft delete failed", id, e);
    return Response.json({ error: "消せませんでした。時間をおいてもう一度お試しください" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
