import { getStudioSeries } from "@/lib/series-studio";
import { SHOWN_SERIES_LIST } from "@/lib/story-key";
import { SeriesStudio, type StudioView } from "./studio";

// 台本の絵スタジオ。台本（場面の説明）はサーバーで読み、画面に要る分だけ渡す。
export default function SeriesPage() {
  const list: StudioView[] = SHOWN_SERIES_LIST.map((info) => {
    const s = getStudioSeries(info.id)!;
    return {
      id: s.id,
      name: s.name,
      sidekickLabel: s.sidekickLabel,
      episodes: s.episodes.map((ep) => ({ no: ep.no, title: ep.title, cover: { label: ep.cover.label }, scenes: ep.scenes.map((sc) => ({ label: sc.label })) })),
    };
  });
  return <SeriesStudio list={list} />;
}
