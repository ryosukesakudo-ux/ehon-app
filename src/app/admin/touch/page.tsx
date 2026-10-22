import { getStudioSeries } from "@/lib/series-studio";
import TouchStudio from "./touch-studio";

// タッチ試作：手描き風の3つのタッチで、森1話の同じ場面を描いて見比べる（お客様の画面には出ない）
export default function TouchPage() {
  const episode = getStudioSeries("forest")?.episodes.find((e) => e.no === 1);
  return <TouchStudio scenes={(episode?.scenes ?? []).map((s) => s.label)} />;
}
