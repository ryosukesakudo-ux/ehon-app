import { getStudioSeries } from "@/lib/series-studio";
import { SERIES_DATA } from "@/lib/series-data";
import { seriesSampleChildName } from "@/lib/series";
import { SHOWN_SERIES_LIST } from "@/lib/story-key";
import { SeriesStudio, type StudioView } from "./studio";

// 台本の絵スタジオ。台本（場面の説明）はサーバーで読み、画面に要る分だけ渡す。
export default function SeriesPage() {
  const list: StudioView[] = SHOWN_SERIES_LIST.map((info) => {
    const s = getStudioSeries(info.id)!;
    const name = seriesSampleChildName(info.id);
    // 見開きの試作で絵に重ねて見せる文（文の量 少ない・普通・多い の3つ、見本の家族はママもパパもいる形）。ふりがなは外す
    const textsOf = (no: number, i: number) => {
      const sc = SERIES_DATA[info.id].episodes.find((e) => e.no === no)?.scenes[i];
      const v = sc?.alt?.both ?? sc;
      return [0, 1, 2].map((l) => (v?.text[l] ?? v?.text[0] ?? "").replaceAll("{name}", name).replace(/《[^》]*》/g, ""));
    };
    return {
      id: s.id,
      name: s.name,
      sidekickLabel: s.sidekickLabel,
      episodes: s.episodes.map((ep) => ({ no: ep.no, title: ep.title, cover: { label: ep.cover.label }, scenes: ep.scenes.map((sc, i) => ({ label: sc.label, texts: textsOf(ep.no, i) })) })),
    };
  });
  return <SeriesStudio list={list} />;
}
