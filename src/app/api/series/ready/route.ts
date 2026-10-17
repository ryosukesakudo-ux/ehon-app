import { readyEpisodes } from "@/lib/series-studio";
import { publishedEpisodes } from "@/lib/published-episodes";

// お話選びの画面から呼ぶ。art：見本の絵（表紙＋12場面）がそろった話 / published：本番に出して注文できる話（絵スタジオのボタンで変える）
export async function GET() {
  const [art, published] = await Promise.all([readyEpisodes(), publishedEpisodes()]);
  // Vercel の配信網（日本の近く）に60秒覚えさせる。毎回シドニーで絵の有無を数十か所調べると、お話選びが出るまで待たされるため。
  // 絵スタジオで「本番に出す」を押してから、お客様の画面に出るまで最大1分ほどかかる。
  return Response.json({ art, published }, { headers: { "Cache-Control": "public, max-age=60", "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" } });
}
