import type { StoryId } from "./catalog";

// 台本（シリーズ）の絵を、作例と同じ架空の家族（主人公「はると」とママ・パパ）で作るためのデータ。
// 台本は Claude Doc で確定させたもの（2026-10-11）。サイトの本番のお話に入れる前に、絵の出来を確かめるのに使う。
// 森のお話は第1〜5話（季節は春・夏・秋・冬・春）。

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
      {
        no: 2,
        title: "ほたるの かわの ひみつ",
        outfits:
          "light summer clothes in the same colors as the reference: the child in a short-sleeved T-shirt and shorts, the parents in short sleeves",
        cover: {
          label: "夜の川辺で、ほたるの光に囲まれて笑う主人公とポッケ",
          art: "on a summer night by a forest river, the child and Pokke the squirrel laugh happily, surrounded by countless glowing fireflies whose lights reflect on the water",
          withSidekick: true,
        },
        scenes: [
          {
            label: "パパと二人でテントを張る。主人公の胸のバッジが光る",
            art: "summer camping at the edge of the forest; the father and the child pull a rope together to put up a small tent, and the leaf badge on the child's chest suddenly sparkles",
            withDad: true,
          },
          {
            label: "慌てて駆けてくるポッケ。地図の川上に×印",
            art: "Pokke the squirrel rushes out of a bush in a panic toward the child, holding up a small hand-drawn map of a river with an X mark at its upper end",
            withSidekick: true,
          },
          {
            label: "地図を握って走り出す主人公、追いかけるポッケ",
            art: "the child runs off confidently upstream along the riverbank clutching the map, while Pokke hurries behind trying to catch up",
            withSidekick: true,
          },
          {
            label: "細い川。草の葉で光の消えたほたるたち",
            art: "a forest river with only a thin trickle of water; on the grass blades along the bank tired fireflies sit with their lights out and wings folded, and the child and Pokke look at them with worry",
            withSidekick: true,
          },
          {
            label: "石と枝の山で塞がれた川。困り顔のビーバーの子ども3匹",
            art: "the river is completely blocked by a big pile of stones and branches; three little beaver children stand beside it with troubled faces, and the child and Pokke arrive",
            withSidekick: true,
          },
          {
            label: "顔を真っ赤にして大きな石を押す主人公",
            art: "the child pushes the biggest stone of the dam with both hands with all their might, face bright red from effort, while Pokke reaches out to help and is waved away",
            withSidekick: true,
          },
          {
            label: "夕焼けの川で尻もちをつき、涙ぐむ主人公",
            art: "under an orange sunset sky the child has slipped and sits in the shallow river, clothes soaked, with tears welling up in their eyes",
          },
          {
            label: "手を差し出すポッケ。後ろに心配そうな仲間たち",
            art: "Pokke gently holds out his little paw to the child sitting in the river; behind him the beaver children and the two rabbit siblings watch with concern",
            withSidekick: true,
          },
          {
            label: "一列に並んで石を手渡しする動物たちと主人公",
            art: "the child, Pokke, the beaver children and the rabbit siblings stand in a line passing stones from hand to hand to clear the dam, working together cheerfully",
            withSidekick: true,
          },
          {
            label: "【見開き】川一面に光るほたる。歓声をあげる仲間たち",
            art: "the river flows again and the whole river is filled with thousands of glowing fireflies lighting up the night; the child, Pokke and all the animal friends cheer with joy. A grand, breathtaking wide view",
            withSidekick: true,
          },
          {
            label: "テントの前でタオルにくるまれる主人公。ほたるの光の道",
            art: "at night in front of the tent the mother wraps the soaked child in a fluffy towel and hugs them; a path of firefly lights leads back from the forest",
            withMom: true,
          },
          {
            label: "テントの入口で金色のどんぐりを見せるポッケ",
            art: "the child lies in a sleeping bag inside the tent with two leaf badges on their chest; at the tent entrance Pokke shows a shining golden acorn from his cheek",
            withSidekick: true,
          },
        ],
      },
      {
        no: 3,
        title: "きんの どんぐりと チッチ",
        outfits:
          "autumn clothes in the same colors as the reference: long sleeves and light jackets, the child in a cozy sweater",
        cover: {
          label: "落ち葉の広場で、星のかんむりをかぶった主人公とねずみのチッチ、肩にポッケ",
          art: "in a forest clearing covered with red and yellow fallen leaves, the child wearing a sparkling star crown stands smiling next to Chicchi, a tiny gray mouse also wearing a star crown, with Pokke the squirrel on the child's shoulder",
          withSidekick: true,
        },
        scenes: [
          {
            label: "紅葉の公園で落ち葉を拾う主人公とママ。手紙つきのどんぐり",
            art: "an autumn park with red and yellow trees; the mother and the child pick up fallen leaves, and the mother reads a tiny letter tucked into the cap of an acorn",
            withMom: true,
          },
          {
            label: "にぎやかな森の秋祭り。ステージにふくろうの村長と星のかんむり",
            art: "a lively autumn festival in a forest clearing full of animals, with chestnut cakes and a pinecone ring-toss game; on a small wooden stage an owl village chief spreads his wings beside a sparkling star crown; the child and Pokke look on excitedly",
            withSidekick: true,
          },
          {
            label: "落ち葉の山に飛びこむ主人公とポッケ。走り出す仲間たち",
            art: "the child and Pokke jump joyfully into a big pile of fallen leaves while the animal friends run off in all directions to search for acorns",
            withSidekick: true,
          },
          {
            label: "いろいろな形の茶色いどんぐりを並べて首をかしげる",
            art: "the child kneels on the leaf-covered ground with many brown acorns of different shapes lined up, tilting their head in puzzlement, Pokke beside them",
            withSidekick: true,
          },
          {
            label: "木の根元で土を掘る、鼻が泥だらけの小さなねずみ",
            art: "at the root of a big tree, Chicchi, a tiny gray mouse with a muddy nose, digs the soil with great effort while the child watches",
          },
          {
            label: "穴の奥から金色のどんぐりを取り出す主人公。背を向けて掘るチッチ",
            art: "the child reaches into the hole Chicchi dug and pulls out a heavy shining golden acorn, eyes wide, while Chicchi digs at another spot with his back turned",
          },
          {
            label: "どんぐりをポケットに隠す主人公。笑顔のチッチ",
            art: "the child secretly slips the golden acorn into their pocket with a guilty face, while Chicchi smiles innocently at them",
          },
          {
            label: "ステージ前でポケットを握る主人公。後ろで背伸びするチッチ",
            art: "in front of the festival stage the child stands clutching their pocket with an uneasy look; behind the crowd little Chicchi stands on tiptoe trying to see",
          },
          {
            label: "ステージ上でどんぐりを掲げる主人公、驚くチッチ。静まる広場",
            art: "on the stage the child holds the golden acorn high while holding Chicchi's hand; Chicchi looks surprised and the crowd of animals is silent",
          },
          {
            label: "【見開き】二つに分かれた星のかんむりをかぶる二人。落ち葉の紙吹雪",
            art: "on the stage the star crown has split into two, one on the child's head and one on Chicchi's; the owl chief spreads his wings and confetti of colorful autumn leaves swirls over the cheering crowd. A grand, breathtaking wide view",
            withSidekick: true,
          },
          {
            label: "パパと一緒に落ち葉の山に飛びこむ主人公",
            art: "in the evening park the father and the child dive together into a big pile of fallen leaves, laughing, leaves flying everywhere",
            withDad: true,
          },
          {
            label: "窓辺であくびをするポッケ、白い小さな羽を手渡す",
            art: "night in the child's bedroom; three leaf badges on the child's pajamas; at the window Pokke yawns sleepily and hands over a small pure-white feather",
            withSidekick: true,
          },
        ],
      },
      {
        no: 4,
        title: "ゆきの よるの まいごの ふくろう",
        outfits:
          "warm winter clothes in the same colors as the reference: puffy coats, knitted hats, scarves and mittens",
        cover: {
          label: "雪の夜の森で、コートからふくろうの赤ちゃんが顔を出し、胸の3枚のバッジが光る主人公",
          art: "in a snowy forest at night, a round fluffy baby owl peeks out from the front of the child's coat, and three leaf badges on the child's chest glow softly; Pokke sits on the child's shoulder",
          withSidekick: true,
        },
        scenes: [
          {
            label: "雪の庭でパパが雪だるまの頭をのせる。口をとがらせて見上げる主人公",
            art: "a snowy garden; the tall father places the head on top of a big snowman, while the small child looks up pouting",
            withDad: true,
          },
          {
            label: "夜の寝室で光りだす白い羽。コートを羽織る主人公",
            art: "night in the child's bedroom; the small white feather by the pillow starts to blink with light, and the child puts on a winter coat with three leaf badges on the chest",
          },
          {
            label: "雪の中で震えるまん丸のふくろうの赤ちゃん。木の穴から寝ぐせのポッケ",
            art: "in the snowy night forest a round fluffy baby owl shivers in the snow; the child crouches beside it, and a sleepy Pokke with messy bed-head fur peeks out of a hole in a tree",
            withSidekick: true,
          },
          {
            label: "コートの胸元から赤ちゃんが顔を出す。肩にポッケ",
            art: "the child walks through the snowy forest with the baby owl tucked inside the front of their coat, its face peeking out, and Pokke on the child's shoulder",
            withSidekick: true,
          },
          {
            label: "雪に埋もれた巣穴から顔を出すうさぎの兄弟",
            art: "the two rabbit siblings poke their heads out of a burrow buried in snow, pointing the way for the child and Pokke",
            withSidekick: true,
          },
          {
            label: "吹雪で真っ白な森。消えていく足あと。立ちすくむ主人公",
            art: "a blizzard turns the forest completely white; the child's footprints disappear behind them and the child stands frozen, unsure where to go, holding the baby owl in their coat",
            withSidekick: true,
          },
          {
            label: "吹雪の中でコートごしに赤ちゃんを抱きしめる主人公",
            art: "in the howling blizzard the child hugs the baby owl tightly through their coat to keep it warm, eyes closed with determination",
            withSidekick: true,
          },
          {
            label: "胸の3枚の葉っぱバッジがそれぞれの色（桃・緑・金）で光る",
            art: "close-up of the child in the snow as the three leaf badges on their chest glow, each in its own color: pink, green and gold",
            withSidekick: true,
          },
          {
            label: "雪の上に光の粒が一列にともり、吹雪の中に道ができる",
            art: "the child takes a step forward and grains of light spill from the badges onto the snow, lighting up one by one in a line that forms a glowing path through the blizzard",
            withSidekick: true,
          },
          {
            label: "【見開き】巨大な松の木、翼を広げて舞い降りる母ふくろう。晴れた星空",
            art: "at the end of the path of light stands a huge pine tree; a big mother owl swoops down with her wings spread wide to embrace the baby owl jumping out of the child's coat; the blizzard has stopped and the sky is full of stars. A grand, breathtaking wide view",
            withSidekick: true,
          },
          {
            label: "毛布にくるまれてココアを飲む主人公とママ。窓の外は雪",
            art: "back home by the window, the child wrapped in a fluffy blanket drinks hot cocoa with the mother; snow falls outside the window",
            withMom: true,
          },
          {
            label: "窓の外の枝に母ふくろう。枕元に4枚目の雪の結晶模様のバッジ",
            art: "night in the child's bedroom; on a snowy branch outside the window the mother owl perches and speaks; beside the pillow a fourth leaf badge with a silver snowflake pattern shines",
          },
        ],
      },
      {
        no: 5,
        title: "おじいの きの たんじょうび",
        cover: {
          label: "満開のおじいの木の下、これまでの仲間全員に囲まれた主人公とポッケ",
          art: "under a giant ancient tree in full bloom with pink, green, gold and silver leaves, the child and Pokke the squirrel stand happily surrounded by all their forest friends: two rabbit siblings, three beaver children, a tiny gray mouse, an owl chief and an owl mother with her baby",
          withSidekick: true,
        },
        scenes: [
          {
            label: "第1話と同じ構図の草原。少し背が伸びた主人公とママ、胸に4枚のバッジ",
            art: "a spring picnic on a blanket in a meadow at the edge of a deep forest, the same view as a year ago; the mother points at the child's long shadow; the child, a little taller now, wears four leaf badges on their chest",
            withMom: true,
          },
          {
            label: "草むらから飛び出す、少しふっくらしたポッケ",
            art: "Pokke the squirrel, a little plumper after his winter sleep, leaps out of the grass toward the child, waving excitedly",
            withSidekick: true,
          },
          {
            label: "空っぽのポケットを裏返して困る主人公",
            art: "the child turns their empty pockets inside out with a troubled face, having no birthday present, while Pokke looks on",
            withSidekick: true,
          },
          {
            label: "第1話のトンネルを笑顔で歩く二人。出口で手を振るうさぎの兄弟",
            art: "the child and Pokke walk smiling through the same root tunnel as before, now bright and familiar; at the exit the two rabbit siblings wave to them",
            withSidekick: true,
          },
          {
            label: "大きな木の周りに第2〜4話の仲間が贈り物を並べる。後ろでもじもじする主人公",
            art: "around the giant ancient tree the forest friends line up presents: the beaver children with a handmade wooden chair, the tiny gray mouse with acorn bread, the owl mother and baby singing; the child fidgets shyly at the back",
            withSidekick: true,
          },
          {
            label: "花も葉もない寂しげな大きな木。見上げる動物たち",
            art: "the giant ancient tree stands bare with no flowers or leaves, looking lonely and tired; the animals and the child look up at it quietly",
            withSidekick: true,
          },
          {
            label: "大きな木の幹にうっすら優しい顔。耳をすます主人公",
            art: "a faint, gentle old face appears in the bark of the giant tree's trunk; the child puts a hand on the trunk and listens closely",
            withSidekick: true,
          },
          {
            label: "胸の4枚のバッジに手を当てる主人公。各葉に各話の思い出が小さく映る",
            art: "the child places a hand over the four leaf badges on their chest (pink, green, gold and silver); tiny memories glow inside each leaf: a root tunnel, fireflies over a river, a star crown, a snowy path of light",
            withSidekick: true,
          },
          {
            label: "根元に4枚のバッジをそっと置く主人公。見守る仲間たち",
            art: "the child gently lays the four leaf badges at the roots of the giant tree as a present, while all the forest friends watch warmly",
            withSidekick: true,
          },
          {
            label: "【見開き】四季の色（桃・緑・金・銀）が一度に咲く大きな木。第1話の満開場面と対になる構図",
            art: "the giant ancient tree bursts into bloom all at once in the colors of the four seasons, pink, green, gold and silver, light racing up its trunk; the small child, Pokke and all the friends look up from below cheering. A grand, breathtaking wide view",
            withSidekick: true,
          },
          {
            label: "満開の木の下で家族と仲間がたんじょうび会。主人公の手に名前入りの葉",
            art: "a joyful birthday party under the blooming giant tree with the mother, the father and all the forest friends; a new glowing leaf with sparkling letters floats down into the child's palm",
            withMom: true,
            withDad: true,
            withSidekick: true,
          },
          {
            label: "夕暮れ、パパに肩車された主人公と肩のポッケ。森の向こうに光る海",
            art: "at sunset on a hill, the father carries the child on his shoulders with Pokke on the child's shoulder; far beyond the forest a sparkling sea shines on the horizon, and a glowing leaf is in the child's hand",
            withDad: true,
            withSidekick: true,
          },
        ],
      },
    ],
  },
};

/** 絵スタジオで1枚ごとに書ける追加の指示の最大文字数 */
export const SERIES_NOTE_MAX = 200;

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
