import { deleteDraftImages, demoDraftId, draftOrdered, draftPreviewScenes, isDemoId, loadOwnedDraft, previewUrls, type Draft } from "@/lib/drafts";
import { fixedLevelEpisode, parseSeriesKey, seriesKey, withoutCombo, type LevelId } from "@/lib/story-key";
import { getFlowSave, putFlowSave } from "@/lib/flow-save";
import { getSupabase } from "@/lib/services";
import { customKey, parseCustomKey } from "@/lib/custom-story";
import { getBook } from "@/lib/book";
import { sceneText } from "@/lib/catalog";

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
    // 本文12場面の文（プレビューで絵の下に出す。写真の組み合わせに合わせた、本に載るのと同じ文）
    texts: textsOf(draft),
  });
}

function textsOf(draft: Pick<Draft, "story" | "child_name">) {
  return getBook(draft.story)?.scenes.map((s) => sceneText(s, draft.child_name)) ?? [];
}

const LEVEL_IDS: LevelId[] = ["s", "n", "l"];

// プレビューで文の量（少ない・普通・多い）を切り替える（2026-10-13 作道さん）。
// 絵は文の量によらず同じなので、本文の文だけが変わる（プレビューの枚数は使わない）。
// シリーズのお話だけ（オリジナルのお話は、文の量を変えるとお話の書き直しになるので対象外。文の量が決まっている話も対象外）。
export async function PATCH(request: Request, ctx: RouteContext<"/api/drafts/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const level = LEVEL_IDS.find((l) => l === body?.level);
  if (!level) return Response.json({ error: "文の量を選んでください" }, { status: 400 });
  const owned = await loadOwnedDraft(id);
  if (!owned) return Response.json({ error: "下書きが見つかりません" }, { status: 404 });
  const { draft } = owned;
  const k = parseSeriesKey(draft.story);
  if (!k || fixedLevelEpisode(k.series, k.episode)) return Response.json({ error: "このお話は文の量を変えられません" }, { status: 400 });
  if (await draftOrdered(draft.id)) return Response.json({ error: "ご注文済みの絵本は変更できません" }, { status: 409 });
  const story = seriesKey(k.series, k.episode, level, k.combo);
  let draftId = draft.id;
  if (isDemoId(draft.id)) {
    // デモの下書きは番号に中身が入っているので、番号ごと作り直す
    draftId = demoDraftId({ taste: draft.taste, story, childName: draft.child_name, childAge: draft.child_age, hasMom: !!draft.mom_photo_path, hasDad: !!draft.dad_photo_path });
  } else {
    const db = getSupabase();
    if (!db) return Response.json({ error: "保存できませんでした" }, { status: 500 });
    const { error } = await db.from("drafts").update({ story }).eq("id", draft.id);
    if (error) {
      console.error("draft level update failed", error);
      return Response.json({ error: "保存できませんでした。もう一度お試しください" }, { status: 500 });
    }
  }
  return Response.json({ draftId, story: withoutCombo(story), texts: textsOf({ story, child_name: draft.child_name }) });
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
