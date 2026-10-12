import { deletePreviewBook, loadOwnedDraft } from "@/lib/drafts";

// プレビューで「登場人物を直す」を押したときに呼ぶ。表紙と本文のプレビューの絵を消す
// （直す前のキャラクターで描いた絵が、注文後にそのまま本に使われないように）。
export async function DELETE(_request: Request, ctx: RouteContext<"/api/drafts/[id]/pages">) {
  const { id } = await ctx.params;
  const owned = await loadOwnedDraft(id);
  if (!owned) return Response.json({ error: "下書きが見つかりません" }, { status: 404 });
  try {
    await deletePreviewBook(owned.draft.id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("preview book delete failed", e);
    return Response.json({ error: "絵の削除に失敗しました。もう一度お試しください" }, { status: 500 });
  }
}
