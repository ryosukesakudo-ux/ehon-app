import { outfitChoicesOf } from "@/lib/outfit-choice";
import { getSeriesInfo, type SeriesId } from "@/lib/story-key";

// 服を選ぶお話（ヒーロー・プリンセス）の、服の形と色の選択肢。台本まるごとを管理画面で直せるので、直したあとの台本から返す。
// 画面に要る名前・説明・色見本だけを返す（絵の指示の英語は返さない）
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("series") ?? "";
  if (!getSeriesInfo(id)) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
  const choices = await outfitChoicesOf(id as SeriesId);
  return Response.json(
    {
      types: (choices?.types ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        note: t.note,
        colors: t.colors.map((c) => ({ id: c.id, name: c.name, swatch: c.swatch })),
      })),
    },
    { headers: { "Cache-Control": "public, max-age=60", "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" } },
  );
}
