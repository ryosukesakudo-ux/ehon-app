import { readyEpisodes } from "@/lib/series-studio";

// お話選びの画面から呼ぶ。見本の絵（表紙＋12場面）がそろって、選べるようになった話の一覧。
export async function GET() {
  return Response.json(await readyEpisodes(), { headers: { "Cache-Control": "public, max-age=60" } });
}
