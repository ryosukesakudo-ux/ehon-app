import { getStudioSeries } from "@/lib/series-studio";
import { SAVED_NOTE_MAX, deleteSavedSet, listSavedSets, saveEpisodeSet, writeSavedNote } from "@/lib/series-saved";

// 見本の保存版。
// kind なし：その話の今の表紙＋12場面を、別の場所（series/{id}/saved/）にコピーする
// kind=note：保存版の1枚（page 0〜12）か一式全体（page="all"）に、直してほしい点のメモを書く
// kind=delete：いらない保存版をまるごと消す（今の見本はそのまま）
// kind=redrawn：そのメモで今の見本を作り直したことを残す（作り直し自体は絵スタジオと同じ /api/admin/series）
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const series = getStudioSeries(String(body?.series ?? ""));
  const episode = series?.episodes.find((e) => e.no === Number(body?.episode));
  if (!series || !episode) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
  try {
    if (body?.kind === "delete") {
      const stamp = String(body?.stamp ?? "");
      if (!(await listSavedSets(series.id, episode.no)).includes(stamp)) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
      await deleteSavedSet(series.id, episode.no, stamp);
      return Response.json({ ok: true });
    }
    if (body?.kind === "note" || body?.kind === "redrawn") {
      const stamp = String(body?.stamp ?? "");
      const key = body?.page === "all" ? "all" : String(Number(body?.page));
      if (!(await listSavedSets(series.id, episode.no)).includes(stamp) || !/^(all|\d+)$/.test(key) || (key !== "all" && Number(key) > 12)) {
        return Response.json({ error: "指定が正しくありません" }, { status: 400 });
      }
      const text = typeof body?.text === "string" ? body.text.trim().slice(0, SAVED_NOTE_MAX) : "";
      await writeSavedNote(series.id, episode.no, stamp, key, body.kind === "redrawn" ? { redrawn: true } : { text });
      return Response.json({ ok: true });
    }
    const stamp = await saveEpisodeSet(series.id, episode.no);
    return Response.json({ ok: true, stamp });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "保存できませんでした" }, { status: 400 });
  }
}
