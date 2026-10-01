import { MAX_PREVIEW_GENERATIONS, PREVIEW_SCENES, getStory } from "@/lib/catalog";
import { generateScene, isDemoId, loadDraft } from "@/lib/drafts";
import { getSupabase } from "@/lib/services";

export const maxDuration = 120;

// プレビュー用の挿絵を1枚作る（作り直しも同じ）。注文前に呼べる場面と回数は制限する。
export async function POST(_request: Request, ctx: RouteContext<"/api/drafts/[id]/scenes/[scene]">) {
  const { id, scene } = await ctx.params;
  const sceneIndex = Number(scene);
  if (!PREVIEW_SCENES.includes(sceneIndex)) {
    return Response.json({ error: "この場面はプレビューできません" }, { status: 400 });
  }
  const draft = await loadDraft(id);
  if (!draft || !getStory(draft.story)) {
    return Response.json({ error: "下書きが見つかりません" }, { status: 404 });
  }

  const db = getSupabase();
  if (db && !isDemoId(id)) {
    // 回数の確認と加算をDB側で一度に行う（同時リクエストでも上限を超えない）
    const { data: claimed, error } = await db.rpc("claim_generation", {
      p_id: id,
      p_max: MAX_PREVIEW_GENERATIONS,
    });
    if (error) {
      console.error("claim_generation failed", error);
      return Response.json({ error: "絵の作成に失敗しました。もう一度お試しください" }, { status: 500 });
    }
    if (!claimed) {
      return Response.json({ error: "作り直しの上限に達しました" }, { status: 429 });
    }
  }

  try {
    const url = await generateScene(draft, sceneIndex, "preview");
    return Response.json({ url });
  } catch (e) {
    console.error("preview generation failed", e);
    return Response.json({ error: "絵の作成に失敗しました。もう一度お試しください" }, { status: 500 });
  }
}
