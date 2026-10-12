import { draftPreviewScenes, loadOwnedDraft, previewUrls } from "@/lib/drafts";
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
