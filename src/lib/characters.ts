// オリジナルキャラクター「おちばの したの まち」（2026-10-17 作道さん決定）
// 森の落としもの（どんぐり・まつぼっくり…）に強めの「キモかわいさ」を足した6体。
// 絵本と YouTube アニメの両方に出す予定で、人間の子どもは出ない（絵本ではお客様の子が「ひろう人」として会える）。
// 設定の原本: /mnt/project-files/characters/kimokawa-forest-cast.md。名前はすべて仮（商標は未確認）。

export type OriginalCharacter = {
  id: string;
  name: string;
  /** もとの物 */
  base: string;
  /** 役割 */
  role: string;
  /** キモ要素 */
  gross: string;
  personality: string;
  catchphrase: string;
  /** 動画での鳴き声（言葉は話さない。2026-10-18 作道さん決定）日本語の説明 */
  voiceJa: string;
  /** 鳴き声の英語の指示（動画AI用） */
  voice: string;
  /** 配色（画面の説明用） */
  colors: string;
  /** 絵を作るときの英語の指示（このキャラだけの特徴） */
  design: string;
};

export const CHARACTER_WORLD_JA = [
  "舞台は森の地面の「落ち葉の下」。昼は落ちているもののふりをして動かず、夜になると動き出す。",
  "足は全員「根っこ」（細い根が3〜5本）。目は白目のない黒いまん丸（ボックルだけ例外）。口の中は黒に近い茶色。",
  "体のどこかに必ず森の湿り気（ぬめり・しずく・カビ・クモの糸）。合言葉は「おちたら、はじまり」。",
];

export const ORIGINAL_CHARACTERS: OriginalCharacter[] = [
  {
    id: "gajiri",
    name: "ガジリ",
    base: "どんぐり",
    role: "リーダー・行動派",
    gross: "殻のふちがぜんぶ歯。帽子（殻斗）が開くと中にもう1列の歯",
    personality: "せっかちで仲間思い。なんでもかじって確かめる",
    catchphrase: "かじっていい？",
    voiceJa: "歯をカチカチ鳴らす音＋短く高い「キュッ」「ギギッ」。急かすように連打",
    voice:
      "a quick, slightly high, eager small-creature voice made only of short squeaks like 'kyu!' and 'gigi!' and rapid teeth clicking; impatient, repeated in short bursts",
    colors: "茶 #8B5A2B・帽子 #5C3A1E・歯 #F2E8D5",
    design:
      "GAJIRI, an acorn. The acorn nut itself is the body (warm brown #8B5A2B) with a darker rough cap (#5C3A1E). FACE ANATOMY, follow exactly: the cap is the upper jaw and the nut body is the lower jaw, and the seam between them is the one and only mouth. A tight row of small human-like teeth (#F2E8D5) runs along the lower rim of the cap (upper teeth) and a matching row runs along the top edge of the body (lower teeth). Inside the mouth gap is a dark inner face, and the two tiny round black dot eyes sit on that dark inner face just below the cap rim, between the two rows of teeth. When the cap is shut the two rows meet as one zipped line of teeth and the eyes are hidden; when the cap lifts like a lid the gap opens, showing the eyes, both rows of teeth and the dark throat. The body below the lower teeth is a plain smooth acorn with NO other mouth, lips, nose or eyes. Energetic, grinning with teeth bared.",
  },
  {
    id: "bokkuru",
    name: "ボックル",
    base: "まつぼっくり",
    role: "ものしり",
    gross: "かさ1枚1枚のすき間に目。全部で20個くらい",
    personality: "見たことをなんでも覚えている。しゃべるとちょっと遠回し",
    catchphrase: "みてたよ",
    voiceJa: "低めでゆっくり「ほぅ……ほぅ……」。ふくろうとカメラのシャッターの間",
    voice:
      "a low, slow, breathy 'hoo... hoo...' like an owl mixed with soft camera-shutter clicks; calm and a little creepy",
    colors: "焦げ茶 #4A3322・目のふち #C9B458",
    design:
      "BOKKURU, a pine cone (dark brown #4A3322). In the gap under every scale sits a small round black eye with a thin yellowish rim (#C9B458), about twenty eyes in total, all looking at the viewer; when sleepy they close one by one. Slightly hunched forward, calm and knowing.",
  },
  {
    id: "numetake",
    name: "ヌメタケ",
    base: "きのこ（傘が青白い）",
    role: "くいしんぼう",
    gross: "傘の裏のひだから常にしずくが垂れる。首が細長く伸びる",
    personality: "のんびり。くさった葉っぱが大好物",
    catchphrase: "くさってるのが いちばん うまい",
    voiceJa: "湿った「ぬぷ」「ぷぽ」という泡の音と、くぐもった満足げな「んふぅ」",
    voice:
      "wet bubbly sounds like 'nupu' and 'pupo' and a muffled, satisfied 'nfuu'; damp and slimy",
    colors: "傘 #A9C4C9・ひだ #6E8B91・柄 #E8E3D3（赤白水玉は使わない）",
    design:
      "NUMETAKE, a mushroom with a pale bluish-grey cap (#A9C4C9) and darker gills (#6E8B91) underneath, from which a few translucent slimy drops are always dripping. The stem (#E8E3D3) is a long thin neck that stretches and leans in to peer at the viewer. Wet glossy highlights on the cheeks. Slow and dreamy. Never a red cap with white spots.",
  },
  {
    id: "sukari",
    name: "スカリ",
    base: "穴だらけの枯れ葉",
    role: "いたずら",
    gross: "虫食いの穴が顔。クモの糸1本でぶら下がって背後に回る",
    personality: "軽い・早い・かわいいうそつき",
    catchphrase: "うしろ、うしろ",
    voiceJa: "かすれた「しゃらしゃら」のささやき。枯れ葉がこすれる音に近い",
    voice:
      "a dry, rustling whisper like 'shara shara', close to dead leaves rubbing together; thin and sneaky",
    colors: "枯れ葉 #B5702E・葉脈 #6B3D14・糸 #FFFFFF",
    design:
      "SUKARI, a dry brown fallen leaf (#B5702E) with dark veins (#6B3D14), full of insect-bitten holes. Two of the holes are its eyes and one ragged hole is its grinning mouth. It hangs from a single white spider thread from above, body tilted, light and mischievous.",
  },
  {
    id: "yaniko",
    name: "ヤニコ",
    base: "木のヤニ（樹液のかたまり）",
    role: "あかちゃん・マスコット",
    gross: "半透明の体の中に、飲みこんだ虫や小石が透けて見える。さわるとねばつく",
    personality: "無口。くっつくのが愛情表現",
    catchphrase: "ぺと",
    voiceJa: "ねばつく「ぺと」「ぴと」の小さな音。ときどき中の虫の「ぶぶ」",
    voice:
      "small sticky sounds like 'peto' and 'pito', with an occasional faint buzz from the bug inside; soft and gooey",
    colors: "琥珀 #E09B2D・中身 #3B2A14・ハイライト #FFF3C4",
    design:
      "YANIKO, a small drop-shaped blob of translucent amber tree resin (#E09B2D) with glossy highlights (#FFF3C4). Inside its see-through body float tiny swallowed insects, pebbles and leaf bits (#3B2A14). Its base is sticky and stretches into gooey strings. Two tiny dot eyes, silent baby-like expression.",
  },
  {
    id: "goke",
    name: "ゴケ",
    base: "コケむした石",
    role: "こわがり・力持ち",
    gross: "全身の長いコケの毛が顔をおおい、かき分けると大きな目が1つ",
    personality: "動くのが怖い。でも乗るといちばん速い",
    catchphrase: "……うごきたくない",
    voiceJa: "ごく低い「ごごご……」のうなり。ほとんど無音",
    voice:
      "an extremely low, slow rumble like 'gogogo...', almost silent; sleepy and heavy",
    colors: "コケ #4F7A3A・石 #6E6E6E・目 #D8E2B8",
    design:
      "GOKE, a round grey stone (#6E6E6E) covered in long shaggy green moss hair (#4F7A3A) that hangs over its face. Through a gap in the hair one single large pale eye (#D8E2B8) peeks out. Timid and heavy; when scared the moss hair stands on end.",
  },
];

export function getOriginalCharacter(id: string) {
  return ORIGINAL_CHARACTERS.find((c) => c.id === id) ?? null;
}

// 絵の置き場所（公開ストレージ samples）。設定画＝三面図、表情＝4つの顔、全員＝6体の並び
export type CharacterArt = "sheet" | "faces";

export function characterArtPath(id: string, kind: CharacterArt) {
  return `characters/original/${id}/${kind}.png`;
}

export const CHARACTER_LINEUP_PATH = "characters/original/lineup.png";

// --- 絵を作るときの共通の指示（英語） ---

// 6体に共通の見た目のルール。見分けやすさと「同じ世界の住人」感のため、毎回必ず付ける
export const CHARACTER_WORLD =
  "WORLD RULES shared by every character of this series (apply them strictly): " +
  "they are things that fell onto the forest floor and secretly came alive under the fallen leaves. " +
  "Every character walks on three to five thin, root-like legs that trail on the ground like plant roots. " +
  "Eyes are small, perfectly round, solid black dots with no whites and no highlights (except where a character's own description says otherwise). " +
  "The inside of every mouth is a very dark brown, almost black. " +
  "Every character shows some forest dampness somewhere: slime, drops, mold, moss or spider silk. " +
  "The overall feeling is strongly 'kimo-kawaii': genuinely a little gross, creepy and unsettling at first glance, yet lovable once you meet its eyes.";

export const CHARACTER_STYLE =
  "ART STYLE: a children's picture book character design, drawn with soft waxy crayon and gouache texture, slightly wobbly dark brown hand-drawn outlines, flat cheerful colors with a few muted earthy tones, visible paper grain. " +
  "Simple readable shapes with one strong silhouette per character. Not anime, not 3D, not realistic. " +
  "The design must be original and must not resemble any existing cartoon, game or mascot character.";

export const NO_TEXT = "Do not draw any letters, words, numbers or text anywhere in the image.";
