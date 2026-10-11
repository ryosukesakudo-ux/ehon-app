import { MEMBER_MONTHLY_PREVIEWS, PREVIEW_PACK, REDO_NOTE_MAX, REDO_OPTIONS, getStory, type RedoOptionId } from "@/lib/catalog";
import { draftPreviewScenes, generateScene, isDemoId, loadOwnedDraft } from "@/lib/drafts";
import { getSupabase } from "@/lib/services";

export const maxDuration = 120;

// プレビュー用の絵（表紙・キャラクター）を1枚作る（作り直しも同じ）。
// 会員は月の無料枠＋追加枠まで。登録前のお試しはプレビューの絵を1回ずつ（作り直しなし）。
// 作り直しでは、選択肢（options）と40字までの一言（note）で、どう直したいかを指示できる。
export async function POST(request: Request, ctx: RouteContext<"/api/drafts/[id]/scenes/[scene]">) {
  const { id, scene } = await ctx.params;
  const sceneIndex = Number(scene);
  const body = await request.json().catch(() => ({}));
  const options = (Array.isArray(body?.options) ? body.options : []).filter((o: unknown): o is RedoOptionId =>
    REDO_OPTIONS.some((r) => r.id === o),
  );
  const note = typeof body?.note === "string" ? body.note.replace(/\s+/g, " ").trim() : "";
  if ([...note].length > REDO_NOTE_MAX) {
    return Response.json({ error: `ひとことは${REDO_NOTE_MAX}文字以内で入力してください` }, { status: 400 });
  }
  const redo = options.length || note ? { options, note } : null;
  const owned = await loadOwnedDraft(id);
  if (!owned || !getStory(owned.draft.story)) {
    return Response.json({ error: "下書きが見つかりません" }, { status: 404 });
  }
  const { draft, user } = owned;
  const scenes = draftPreviewScenes(draft);
  if (!scenes.includes(sceneIndex)) {
    return Response.json({ error: "この場面はプレビューできません" }, { status: 400 });
  }

  const db = getSupabase();
  let remaining: number | null = null;
  let refund: (() => Promise<unknown>) | null = null;

  if (db && !isDemoId(id)) {
    // 回数の確認と加算をDB側で一度に行う（同時リクエストでも上限を超えない）
    if (user) {
      const { data, error } = await db.rpc("claim_member_generation", {
        p_user: user.id,
        p_draft: draft.id,
        p_max: MEMBER_MONTHLY_PREVIEWS,
      });
      if (error) return failed(error);
      if (data < 0) {
        return Response.json(
          {
            error: `今月の無料プレビュー（${MEMBER_MONTHLY_PREVIEWS}枚）を使い切りました。${PREVIEW_PACK.price}円で${PREVIEW_PACK.credits}枚追加するか、来月1日までお待ちください。`,
            remaining: 0,
            needCredits: true,
          },
          { status: 429 },
        );
      }
      remaining = data;
      refund = async () => db.rpc("refund_member_generation", { p_user: user.id, p_draft: draft.id });
    } else {
      const { data: claimed, error } = await db.rpc("claim_generation", { p_id: id, p_max: scenes.length });
      if (error) return failed(error);
      if (!claimed) {
        return Response.json(
          { error: "作り直しは会員登録（無料）後にご利用いただけます。", needLogin: true },
          { status: 403 },
        );
      }
      refund = async () => db.rpc("refund_generation", { p_id: id });
    }
  }

  try {
    const url = await generateScene(draft, sceneIndex, "preview", redo);
    return Response.json({ url, remaining });
  } catch (e) {
    console.error("preview generation failed", e);
    // 失敗した分は回数に数えない
    await refund?.().catch(() => {});
    return Response.json({ error: "絵の作成に失敗しました。もう一度お試しください" }, { status: 500 });
  }
}

function failed(error: unknown) {
  console.error("claim failed", error);
  return Response.json({ error: "絵の作成に失敗しました。もう一度お試しください" }, { status: 500 });
}
