import { readyEpisodes } from "@/lib/series-studio";
import { publishedEpisodes } from "@/lib/published-episodes";

// お話選びの画面から呼ぶ。art：見本の絵（表紙＋12場面）がそろった話 / published：本番に出して注文できる話（絵スタジオのボタンで変える）
export async function GET() {
  const [art, published] = await Promise.all([readyEpisodes(), publishedEpisodes()]);
  return Response.json({ art, published }, { headers: { "Cache-Control": "public, max-age=60" } });
}
