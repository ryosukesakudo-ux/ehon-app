import { isCharacterScene, isLikenessId } from "@/lib/catalog";
import { draftPreviewScenes, loadOwnedDraft, pickCandidate } from "@/lib/drafts";

// キャラクターの3パターンの候補から、お客様が選んだものをその人のキャラクターにする（プレビューの枚数は使わない）
export async function POST(request: Request, ctx: RouteContext<"/api/drafts/[id]/scenes/[scene]/pick">) {
  const { id, scene } = await ctx.params;
  const sceneIndex = Number(scene);
  const body = await request.json().catch(() => ({}));
  if (!isLikenessId(body?.likeness)) return Response.json({ error: "選んだ絵が分かりません" }, { status: 400 });
  const owned = await loadOwnedDraft(id);
  if (!owned) return Response.json({ error: "下書きが見つかりません" }, { status: 404 });
  if (!isCharacterScene(sceneIndex) || !draftPreviewScenes(owned.draft).includes(sceneIndex)) {
    return Response.json({ error: "この場面は選べません" }, { status: 400 });
  }
  try {
    const url = await pickCandidate(owned.draft, sceneIndex, body.likeness);
    return Response.json({ url });
  } catch (e) {
    console.error("candidate pick failed", e);
    return Response.json({ error: "選んだ絵を保存できませんでした。もう一度お試しください" }, { status: 500 });
  }
}
