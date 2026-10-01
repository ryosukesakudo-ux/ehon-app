// 商品データ。料金は /mnt/project-files/business/pricing.md（仮・送料込み・税込）に合わせている。

export type TasteId = "watercolor" | "crayon" | "anime";
export type StoryId = "forest" | "star" | "birthday";
export type SizeId = "S" | "M" | "L";

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
  scenes: Scene[];
}[] = [
  {
    id: "forest",
    name: "もりのだいぼうけん",
    description: "森のなかまと出会い、勇気を出して大きな木をめざすお話",
    ages: "1〜5歳",
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
  price: number;
  popular?: boolean;
}[] = [
  { id: "S", name: "S", spec: "約18cm角・24ページ・ハードカバー", pages: 24, price: 5980 },
  { id: "M", name: "M", spec: "約21cm角・24ページ・ハードカバー", pages: 24, price: 7980, popular: true },
  { id: "L", name: "L", spec: "約25cm角・32ページ・ハードカバー", pages: 32, price: 9980 },
];

// 祖父母用の2冊目（Mサイズ・同梱）
export const EXTRA_COPY_PRICE = 4980;

// 注文前のプレビューで生成する場面（表紙相当の1枚目＋数枚）
export const PREVIEW_SCENES = [0, 3, 8];

// 会員登録前のお試し：見本の場面を1回ずつ（作り直しなし）。ブラウザごと・IPアドレスごとに1回。
export const ANON_TRIAL_IMAGES = PREVIEW_SCENES.length;
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
