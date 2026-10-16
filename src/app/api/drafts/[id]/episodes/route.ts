import { draftForEpisode, extraEpisodeChoices } from "@/lib/episode-bundle";
import { isDemoId, loadOwnedDraft } from "@/lib/drafts";
import { getSeriesInfo, parseSeriesKey } from "@/lib/story-key";

// 2話目以降のまとめ買い（2026-10-16 作道さん）。
// GET：この下書きと一緒に買える話 / POST { episode, draftId? }：その話の下書きを用意する（プレビューを見るとき）
export async function GET(_request: Request, ctx: RouteContext<"/api/drafts/[id]/episodes">) {
  const { id } = await ctx.params;
  const owned = await loadOwnedDraft(id);
  if (!owned) return Response.json({ error: "下書きが見つかりません" }, { status: 404 });
  const k = parseSeriesKey(owned.draft.story);
  if (!k) return Response.json({ episodes: [] });
  const info = getSeriesInfo(k.series)!;
  const nos = await extraEpisodeChoices(owned.draft.story);
  return Response.json({
    series: info.name,
    current: k.episode,
    episodes: nos.map((no) => {
      const ep = info.episodes.find((e) => e.no === no)!;
      return { no, title: ep.title, season: ep.season };
    }),
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/drafts/[id]/episodes">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const episode = Math.floor(Number(body?.episode));
  const owned = await loadOwnedDraft(id);
  if (!owned) return Response.json({ error: "下書きが見つかりません" }, { status: 404 });
  if (isDemoId(id)) return Response.json({ error: "デモモードでは、ほかの話のプレビューは作れません" }, { status: 400 });
  if (!owned.user) return Response.json({ error: "ほかの話のプレビューは、会員登録（無料）後にご利用いただけます", needLogin: true }, { status: 401 });
  if (!(await extraEpisodeChoices(owned.draft.story)).includes(episode)) return Response.json({ error: "この話は今はお選びいただけません" }, { status: 400 });
  const draft = await draftForEpisode(owned.draft, episode, typeof body?.draftId === "string" ? body.draftId : null);
  if (!draft) return Response.json({ error: "下書きを作れませんでした。もう一度お試しください" }, { status: 500 });
  return Response.json({ draftId: draft.id });
}
