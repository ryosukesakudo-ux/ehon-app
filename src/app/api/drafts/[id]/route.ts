import { loadOwnedDraft, previewUrls } from "@/lib/drafts";

// 会員ページの「つづきから」で呼ぶ。下書きの内容と作成済みのプレビューを返す。
export async function GET(_request: Request, ctx: RouteContext<"/api/drafts/[id]">) {
  const { id } = await ctx.params;
  const owned = await loadOwnedDraft(id);
  if (!owned) return Response.json({ error: "下書きが見つかりません" }, { status: 404 });
  const { draft } = owned;
  return Response.json({
    taste: draft.taste,
    story: draft.story,
    childName: draft.child_name,
    previews: await previewUrls(draft.id),
  });
}
