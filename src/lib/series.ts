import type { StoryId } from "./catalog";

// 台本（シリーズ）の絵を、作例と同じ架空の家族（主人公「はると」とママ・パパ）で作るためのデータ。
// 台本は Claude Doc で確定させたもの（2026-10-11）。サイトの本番のお話に入れる前に、絵の出来を確かめるのに使う。
// まずは森のお話の第1話。OKが出たら第2〜5話の場面をここに足す。

export type SeriesId = "forest";

export type SeriesScene = {
  /** 画面に出す短い説明（台本の「絵」の欄） */
  label: string;
  /** AI に渡す場面の説明（英語） */
  art: string;
  withMom?: boolean;
  withDad?: boolean;
  /** 相棒（森ならりすのポッケ）が出る場面 */
  withSidekick?: boolean;
};

export type SeriesEpisode = {
  no: number;
  title: string;
  /** 季節に合わせた服装（設定画の服装を、その話だけこの服に替える。空なら設定画のまま） */
  outfits?: string;
  cover: SeriesScene;
  scenes: SeriesScene[];
};

export const SERIES: Record<
  SeriesId,
  { name: string; story: StoryId; sidekick: string; sidekickLabel: string; episodes: SeriesEpisode[] }
> = {
  forest: {
    name: "もりのだいぼうけん",
    story: "forest",
    sidekickLabel: "相棒のりす「ポッケ」",
    sidekick:
      "Pokke, a small reddish-brown squirrel about the size of the child's forearm, with big round puffed-out cheeks (he keeps treasures in them), a fluffy curled tail, large friendly eyes and a tiny green leaf-shaped scarf",
    episodes: [
      {
        no: 1,
        title: "ひかる たねと おじいの き",
        cover: {
          label: "森の入口で、ポッケと並んで光る種を見つめる主人公",
          art: "at the entrance of a sunny spring forest, the child and Pokke the squirrel sit side by side looking in wonder at a small glowing seed resting in the child's hands; tall trees and a winding path into the forest behind them",
          withSidekick: true,
        },
        scenes: [
          {
            label: "草原のシートに主人公・ママ・パパ。ママが森の奥を指さし、パパがお弁当を広げる",
            art: "a spring picnic on a blanket in a meadow at the edge of a deep forest; the mother points toward the forest while the father unpacks a lunch box, and the child gazes curiously into the forest",
            withMom: true,
            withDad: true,
          },
          {
            label: "茂みで泣く子りす（ポッケ）、のぞきこむ主人公",
            art: "the child crouches and peeks into a leafy bush where Pokke the little squirrel sits crying with tears on his puffed cheeks",
            withSidekick: true,
          },
          {
            label: "ポッケのほっぺから光る種。胸をたたく主人公",
            art: "Pokke pulls a softly glowing seed out of his puffed cheek, and the child taps their own chest with a determined, brave smile",
            withSidekick: true,
          },
          {
            label: "小川の飛び石を渡る主人公とポッケ",
            art: "the child carefully hops across stepping stones over a sparkling small stream, arms out for balance, with Pokke riding on the child's shoulder",
            withSidekick: true,
          },
          {
            label: "葉っぱのボールで遊ぶうさぎの兄弟が道を指さす",
            art: "two rabbit siblings playing with a ball made of leaves point the way down a forest path; the child and Pokke wave to them",
            withSidekick: true,
          },
          {
            label: "光るきのこの道を跳ねながら進む",
            art: "the child skips happily along a path lined with softly glowing mushrooms, Pokke bouncing beside them",
            withSidekick: true,
          },
          {
            label: "木の根のトンネルの暗い入口。立ち止まる二人",
            art: "the child and Pokke stop in front of the dark entrance of a tunnel formed by huge tangled tree roots; the child looks nervous and Pokke clings to the child's leg",
            withSidekick: true,
          },
          {
            label: "振り返る主人公。ポッケのほっぺが内側から光る",
            art: "the child turns back away from the dark root tunnel, looking discouraged, while Pokke's puffed cheeks glow warmly from the inside with the seed's light",
            withSidekick: true,
          },
          {
            label: "種をかかげてトンネルを進む。壁に二人の影",
            art: "inside the root tunnel the child bravely walks forward holding the glowing seed high like a lantern, Pokke on their shoulder; their two shadows stretch along the curved root walls",
            withSidekick: true,
          },
          {
            label: "【見開き】巨木が一斉に満開。光が幹を駆け上がり、見上げる二人",
            art: "a giant ancient tree in a sunny clearing bursts into full bloom all at once; streams of light race up its trunk and pink blossoms fill the branches, and the small child and Pokke look up in awe from below. A grand, breathtaking wide view",
            withSidekick: true,
          },
          {
            label: "パパが主人公を肩車、横でママが拍手。胸に葉っぱのバッジ",
            art: "back at the forest entrance at golden sunset, the father carries the child on his shoulders while the mother claps happily beside them; a small glowing leaf badge is pinned on the child's chest",
            withMom: true,
            withDad: true,
          },
          {
            label: "夜の寝室。窓の外で地図を見せるポッケ。枕元にバッジ",
            art: "night in the child's cozy bedroom; outside the window Pokke holds up a small hand-drawn map of a summer river, and the glowing leaf badge rests beside the child's pillow as the child sits up in bed, smiling",
            withSidekick: true,
          },
        ],
      },
    ],
  },
};

export function getSeries(id: string) {
  return (SERIES as Record<string, (typeof SERIES)[SeriesId] | undefined>)[id];
}

export function getEpisode(id: string, no: number) {
  return getSeries(id)?.episodes.find((e) => e.no === no);
}

/** シリーズの登場人物の設定画（家族3人＋相棒）。そのシリーズの絵はすべてこれを参考に描く */
export function seriesSheetPath(id: SeriesId) {
  return `series/${id}/characters.png`;
}

/** 0 が表紙、1〜12 が場面 */
export function seriesImagePath(id: SeriesId, episode: number, page: number) {
  return `series/${id}/ep${episode}/${page === 0 ? "cover" : String(page).padStart(2, "0")}.png`;
}
