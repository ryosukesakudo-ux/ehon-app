// 商品データ。料金は /mnt/project-files/business/pricing.md（仮・送料込み・税込）に合わせている。

export type TasteId = "watercolor" | "crayon" | "anime";
export type StoryId = "forest" | "star" | "birthday";
export type SizeId = "S" | "M";

export const TASTES: {
  id: TasteId;
  name: string;
  description: string;
  swatch: string;
  prompt: string;
}[] = [
  {
    id: "watercolor",
    name: "水彩",
    description: "にじむ色合いの、やさしい手描き風",
    swatch: "#CFE3F0",
    prompt:
      "soft watercolor children's picture book illustration, gentle bleeding colors, visible paper texture, warm and calm",
  },
  {
    id: "crayon",
    name: "クレヨン",
    description: "子どもの落書きのような、あたたかいタッチ",
    swatch: "#F8D9B8",
    prompt:
      "crayon and colored pencil children's picture book illustration, waxy textured strokes, playful and warm",
  },
  {
    id: "anime",
    name: "ふんわりアニメ",
    description: "まるい線と明るい色の、親しみやすい絵",
    swatch: "#DCEBD3",
    prompt:
      "soft modern anime-style children's picture book illustration, rounded clean lines, bright pastel colors",
  },
];

export type Scene = {
  // 本文。{name} は主人公の名前に置き換える
  text: string;
  // 挿絵の内容（英語でAIに渡す）
  art: string;
  // ママ・パパが登場する場面か
  withMom?: boolean;
  withDad?: boolean;
};

// お話の中身は試作用。本番前に文章を確定させる。
export const STORIES: {
  id: StoryId;
  name: string;
  description: string;
  ages: string;
  /** 表紙の絵の内容（英語でAIに渡す。主人公だけを描く） */
  cover: string;
  scenes: Scene[];
}[] = [
  {
    id: "forest",
    name: "もりのだいぼうけん",
    description: "森のなかまと出会い、勇気を出して大きな木をめざすお話",
    ages: "1〜5歳",
    cover: "the child smiling and waving at the entrance of a magical sunny forest, friendly squirrels and rabbits peeking out around them",
    scenes: [
      { text: "{name}は、もりの いりぐちで おおきく いきを すいこみました。", art: "the child standing at the entrance of a friendly forest, morning light, waving" },
      { text: "「よし、いってみよう！」", art: "the child stepping onto a mossy path between tall trees, determined smile" },
      { text: "きの うえから、りすさんが こんにちは。", art: "a small squirrel greeting the child from a tree branch" },
      { text: "「ママ、みて！」ゆびさした さきには、ひかる きのみ。", art: "the child and their mother holding hands, pointing at glowing berries", withMom: true },
      { text: "ちいさな かわを、いしを つたって わたります。", art: "the child carefully crossing a small stream on stepping stones" },
      { text: "うさぎさんたちも ついてきました。", art: "a group of rabbits following the child along the path" },
      { text: "くらい トンネルの まえで、すこし どきどき。", art: "the child pausing nervously in front of a dark tree tunnel" },
      { text: "でも、{name}は ゆうきを だして すすみます。", art: "the child walking bravely through the tunnel holding a small lantern" },
      { text: "トンネルを ぬけると、おおきな おおきな きが ありました。", art: "a giant ancient tree in a sunny clearing, the child looking up in awe" },
      { text: "もりの なかまが みんなで おいわい。", art: "forest animals celebrating around the child under the giant tree" },
      { text: "かえりみち、ママと パパが ぎゅっと だきしめて くれました。", art: "the mother and father hugging the child warmly on the way home at sunset", withMom: true, withDad: true },
      { text: "{name}の だいぼうけんは、まだまだ つづきます。", art: "the child sleeping peacefully, dreaming of the forest" },
    ],
  },
  {
    id: "star",
    name: "ママとおほしさまのくに",
    description: "ママといっしょに夜空を旅して、流れ星にお願いするお話",
    ages: "3〜8歳",
    cover: "the child floating happily among sparkling stars and soft clouds under a smiling crescent moon",
    scenes: [
      { text: "ねむれない よる、{name}は まどの そとを みていました。", art: "the child at a bedroom window looking at a starry night sky" },
      { text: "「いっしょに いってみる？」ママが ほほえみます。", art: "the mother smiling and holding out her hand to the child at night", withMom: true },
      { text: "ふたりは ほしの はしごを のぼりました。", art: "the child and mother climbing a ladder made of stars into the sky", withMom: true },
      { text: "くもの うえは、ふわふわの じゅうたん。", art: "the child bouncing on soft clouds under the moon" },
      { text: "おつきさまが「ようこそ」と あいさつ。", art: "a friendly smiling moon greeting the child" },
      { text: "ほしの こどもたちと かくれんぼ。", art: "the child playing hide and seek with small glowing star children" },
      { text: "ほしの みずうみで、ママと ボートに のりました。", art: "the child and mother rowing a boat on a lake reflecting stars", withMom: true },
      { text: "「あ、ながれぼし！」", art: "a bright shooting star crossing the sky, the child pointing excitedly" },
      { text: "{name}は めを とじて、そっと おねがいしました。", art: "the child with eyes closed making a wish, hands together" },
      { text: "ほしたちが きらきらと ひかって こたえます。", art: "stars sparkling all around the child like an answer" },
      { text: "かえりは、パパの せなかで うとうと。ママも となりで にっこり。", art: "the child dozing on the father's back walking down from the sky, the mother smiling beside them", withMom: true, withDad: true },
      { text: "おねがいごとは、ふたりだけの ひみつです。", art: "the child asleep in bed, a small star glowing on the windowsill" },
    ],
  },
  {
    id: "birthday",
    name: "たんじょうびのまほう",
    description: "誕生日の朝、ふしぎな招待状が届くお話",
    ages: "5〜10歳",
    cover: "the child in a party hat standing before a glowing magical door, colorful balloons and floating lanterns around them",
    scenes: [
      { text: "たんじょうびの あさ、まくらもとに ふしぎな てがみ。", art: "the child waking up and finding a sparkling letter by the pillow" },
      { text: "「{name}さま、まほうの パーティーへ ごしょうたい」", art: "the child reading a magical invitation with wide eyes" },
      { text: "てがみが ひかって、とびらが あらわれました。", art: "a glowing magical door appearing in the child's bedroom" },
      { text: "とびらの むこうは、おかしの まち。", art: "a whimsical town made of sweets and cakes" },
      { text: "まほうつかいの ねこが あんないしてくれます。", art: "a friendly cat wizard in a starry hat guiding the child" },
      { text: "パーティーの じゅんびを てつだいました。", art: "the child helping decorate a party hall with floating lanterns" },
      { text: "ふうせんに のって、そらの さんぽ。", art: "the child floating in the sky holding colorful balloons" },
      { text: "ママと パパも かけつけて くれました。", art: "the mother and father arriving at the magical party with big smiles", withMom: true, withDad: true },
      { text: "おおきな ケーキに、ろうそくが ともります。", art: "a huge birthday cake with glowing candles, the child about to blow" },
      { text: "「おたんじょうび おめでとう！」", art: "everyone at the party cheering for the child, confetti" },
      { text: "まほうの プレゼントは、たからものの ほん。", art: "the child receiving a glowing storybook as a present", withMom: true },
      { text: "{name}の あたらしい いちねんが はじまります。", art: "the child back in bed holding the book, sunrise through the window" },
    ],
  },
];

export const SIZES: {
  id: SizeId;
  name: string;
  spec: string;
  pages: number;
  /** 印刷の仕上がりサイズ（正方形の1辺、mm） */
  trimMm: number;
  price: number;
  popular?: boolean;
}[] = [
  { id: "S", name: "S", spec: "約18cm角・24ページ・ソフトカバー", pages: 24, trimMm: 182, price: 3980 },
  { id: "M", name: "M", spec: "約21cm角・24ページ・ハードカバー", pages: 24, trimMm: 210, price: 5980, popular: true },
];

// 祖父母用の2冊目（Mサイズ・同梱）
export const EXTRA_COPY_PRICE = 2980;

// 表紙の絵の番号（場面とは別の1枚。保存先は 99.png）。表紙は横長（3:2）で描き、タイトルは絵の上の帯に置く
export const COVER_SCENE = 99;
export const COVER_SIZE = "1536x1024";

/** 本番で作る絵の番号（表紙＋全場面） */
export function bookScenes(storyId: StoryId) {
  return [COVER_SCENE, ...(getStory(storyId)?.scenes.map((_, i) => i) ?? [])];
}

/** 本の題名（表紙・扉に使う） */
export function bookTitle(storyId: StoryId, childName: string) {
  return { lead: `${childName}の`, main: getStory(storyId)?.name ?? "" };
}

// 注文前のプレビューで作る3枚：表紙、ママが出てくる場面、パパが出てくる場面。
// ママ（パパ）の写真がないときは、その1枚をママ・パパの出てこない場面からランダムに選ぶ（下書きごとに固定）。
export const PREVIEW_COUNT = 3;

export function previewScenes(storyId: StoryId, opts: { hasMom: boolean; hasDad: boolean; seed: string }) {
  const scenes = getStory(storyId)?.scenes ?? [];
  const idx = scenes.map((_, i) => i);
  const picked: number[] = [COVER_SCENE];
  let seed = [...opts.seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const random = () => {
    const solo = idx.filter((i) => !scenes[i].withMom && !scenes[i].withDad && !picked.includes(i));
    seed = (seed * 1103515245 + 12345) >>> 0;
    return solo[seed % solo.length];
  };
  const momOnly = idx.find((i) => scenes[i].withMom && !scenes[i].withDad);
  const mom = opts.hasMom ? (momOnly ?? idx.find((i) => scenes[i].withMom)) : undefined;
  picked.push(mom ?? random());
  const dad = opts.hasDad ? idx.find((i) => scenes[i].withDad && !picked.includes(i)) : undefined;
  picked.push(dad ?? random());
  return picked;
}

// 会員登録前のお試し：見本の場面を1回ずつ（作り直しなし）。ブラウザごと・IPアドレスごとに1回。
export const ANON_TRIAL_IMAGES = PREVIEW_COUNT;
export const ANON_TRIAL_IP_DAYS = 30;

// 会員が1か月（日本時間の月初リセット）に作れるプレビューの枚数（作り直しを含む）。AI費用の歯止め。
export const MEMBER_MONTHLY_PREVIEWS = 30;

// 保管期間（日）
export const RETENTION = {
  /** 会員の顔写真：最後に使ってからこの日数で自動削除 */
  photoIdleDays: 365,
  /** 登録前のお試しの顔写真：会員登録されなければ削除 */
  anonPhotoDays: 3,
  /** 注文されなかった下書きの絵 */
  unpaidImageDays: 30,
  /** 支払い済みの注文の絵（支払い日から） */
  paidImageDays: 100,
};

export function getTaste(id: string) {
  return TASTES.find((t) => t.id === id);
}
export function getStory(id: string) {
  return STORIES.find((s) => s.id === id);
}
export function getSize(id: string) {
  return SIZES.find((s) => s.id === id);
}

// お届け日の指定：ご注文日から7日後〜60日後（日本時間）。指定しなければ最短でお届け。
export const DELIVERY_MIN_DAYS = 7;
export const DELIVERY_MAX_DAYS = 60;
export const DELIVERY_TIMES = [
  { id: "am", label: "午前中" },
  { id: "14-16", label: "14〜16時" },
  { id: "16-18", label: "16〜18時" },
  { id: "18-20", label: "18〜20時" },
  { id: "19-21", label: "19〜21時" },
] as const;
export type DeliveryTimeId = (typeof DELIVERY_TIMES)[number]["id"];

/** 日本時間の今日から days 日後の日付（YYYY-MM-DD） */
export function jstDate(days: number, now = new Date()) {
  return new Date(now.getTime() + 9 * 3600_000 + days * 86400_000).toISOString().slice(0, 10);
}

/** お届け日・時間帯の表示（例：10月20日（月）午前中）。指定なしは「最短でお届け」 */
export function deliveryLabel(date: string | null | undefined, time: string | null | undefined) {
  const t = DELIVERY_TIMES.find((d) => d.id === time)?.label ?? "";
  if (!date) return t ? `最短でお届け・${t}` : "最短でお届け";
  const d = new Date(`${date}T00:00:00Z`);
  const w = "日月火水木金土"[d.getUTCDay()];
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${w}）${t ? ` ${t}` : ""}`;
}

/** 主人公の年齢の選択肢（1〜10歳） */
export const CHILD_AGES = Array.from({ length: 10 }, (_, i) => i + 1);

export function sceneText(scene: Scene, childName: string) {
  return scene.text.replaceAll("{name}", childName);
}

export function orderTotal(sizeId: SizeId, extraCopy: boolean) {
  const size = getSize(sizeId);
  if (!size) throw new Error(`unknown size: ${sizeId}`);
  return size.price + (extraCopy ? EXTRA_COPY_PRICE : 0);
}

export function yen(n: number) {
  return `${n.toLocaleString("ja-JP")}円`;
}
