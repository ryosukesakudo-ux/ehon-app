import "server-only";
import type { Uploadable } from "openai/uploads";
import { COVER_SCENE, COVER_SIZE, LIKENESS_LEVELS, REDO_OPTIONS, characterOf, getStory, guestOf, getTaste, type LikenessId, type Person, type RedoOptionId, type StoryId, type TasteId } from "./catalog";
import { getBook, type BookScene } from "./book";
import { getOpenAI } from "./services";
import { upscalePng } from "./upscale";
import { SERIES_NOTE_MAX, type SeriesScene } from "./series";
import type { StudioSeries } from "./series-studio";
import type { Continuity } from "./series-data";
import { sceneTextSide } from "./spread-scene";

export type { Person };

// 写真をもとに描くとき、写実的になりすぎないようにする指示（お客様の絵本と、トップの見本で共通）
const PICTURE_BOOK_CHARACTERS =
  "Turn everyone into hand-drawn picture-book characters, not realistic portraits: simplified rounded faces, soft rosy cheeks, a small simple nose, simplified hands and clothing folds, " +
  "no photographic skin texture, lighting or detail. Keep only the traits that make each person recognizable, such as hairstyle, hair color, glasses and overall look. " +
  "Draw expressive picture-book eyes with a visible colored iris, a dark pupil and a small white highlight, gently shaped eyelids and lashes where fitting. Never draw the eyes as plain black dots or simple lines.";
export type Quality = "preview" | "final";
/** AIの画質。管理画面の注文の絵づくりは中画質が標準（2026-10-11 作道さん）、高画質も選べる */
export type Detail = "medium" | "high";

// 本文の絵の構図。文章は左ページ（別ページ）に置くので、絵の中に文字用の空きは作らない。
// 以前は「下に文字用の空き」を指示していて、人物の足元が空白に溶けて切れることがあった。
const SQUARE_FRAMING =
  "Square composition that fills the whole frame with the scene, edge to edge. Frame the shot so every character's whole body, including the legs and feet, " +
  "fits inside the picture with a little ground visible below their feet; never crop, fade out or hide any part of their bodies at the edges. " +
  "Do not leave an empty or blank band anywhere. Do not draw any letters, words or text in the image.";

// 台本のシリーズの絵は、場面ごとにカメラの位置（後ろから・下からあおる・上から・動きのある横からなど）を決めてある。
// 正面向きの似た絵ばかりにならないように（2026-10-11 作道さんの要望）。寄りの場面では全身を入れなくてよい。
function cameraPrompt(camera?: string) {
  if (!camera) return "";
  return [
    `Camera and composition: ${camera}`,
    "Make it a dynamic, cinematic picture-book illustration with a strong sense of movement and depth: the characters act, move and look at each other or at what is happening, never stiffly posing toward the viewer.",
    /close-up|close up/i.test(camera) ? "Because this is a close-up, it is fine to crop the characters' bodies at the frame edges; keep faces and hands fully inside the picture." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// 見開きの試作（2026-10-13 作道さん：TaleCoco のように左右2ページにまたがる大きな絵を試したい）。
// AIの横長は 3:2（1536x1024）なので、見開き（2:1）にするとき上下を少し切る。綴じ目（真ん中）に顔や大事な物を置かない。
// 文は絵の上に重ねるので、文を置くページ（textSide）の下のほうを空けておく。人物は反対のページに寄せる。
// 空ける側も同じ場所のつづき（2026-10-13 作道さん：トンネルの場面で、右ページがトンネルの中に見えなかった）。
const spreadFraming = (textSide: "left" | "right") => {
  const other = textSide === "left" ? "right" : "left";
  return (
    "This picture will be printed across a two-page spread of a square picture book: the final shape is twice as wide as it is tall, so about the top sixth and the bottom sixth of this image will be trimmed off. " +
    "Make a wide, panoramic composition of this scene's setting that fills the whole frame edge to edge. Keep every face, hand and important object inside the middle two-thirds of the image height. " +
    "The vertical center line of the image is the binding fold of the book: never place a face, a hand or an important object on or near the center line. " +
    `Put all the characters, animals and important objects clearly on the ${other} half of the image. ` +
    "Both halves show one single continuous place at the same moment: the same location, the same light and the same time of day, flowing seamlessly across the fold. " +
    "The other half is never a different place: if the scene is inside a tunnel, a cave, a room or a forest, the whole width is inside that same tunnel, cave, room or forest; do not open it up into a meadow, sky or landscape that the scene does not have. " +
    `On the ${textSide} half, keep the whole lower half a calm, simple area of that same setting (for example the plain tunnel wall or floor, a plain wall of the room, the ground, or open sky only when the scene is outdoors), with no people, no animals and no faces, where a short text will be overlaid later. ` +
    "Never crop, fade out or hide any part of the characters' bodies at the edges, except the trimmed top and bottom margins, which must contain only background. Do not leave an empty or blank band anywhere. Do not draw any letters, words or text in the image."
    );
};

// 写真に写っている顔の飾り（シール・メガネなど）を絵では描かない（2026-10-13 作道さん：TaleCoco の本で、写真の目の下のシールが
// 泣く場面・眠る場面も含めて全ページに残っていた）。写真の画面のチェックで選んだときだけ、キャラクターと全ページに付ける
const PLAIN_FACE =
  "Important, this overrides the other instructions: do not copy face decorations or accessories from the reference photos. Never draw stickers, rhinestones, face paint, glitter, temporary tattoos, bandages, glasses or sunglasses on anyone's face. " +
  "Draw clean, natural faces, and keep everything else about each person (face shape, eyes, hairstyle and hair color) the same.";

/** 寄り（クローズアップ）のときは「全身を入れる」構図の指示を外す */
function framing(camera?: string) {
  return camera && /close-up|close up/i.test(camera)
    ? "Square composition that fills the whole frame with the scene, edge to edge. Do not leave an empty or blank band anywhere. Do not draw any letters, words or text in the image."
    : SQUARE_FRAMING;
}

// 台本のシリーズの絵で、登場人物を取り違えないための指示（2026-10-11 森3話の不具合：ねずみのチッチが場面によって
// りすや女の子になり、知らない男の子や主人公と同じ服の子が描かれた）。名前だけの場面でも見た目の説明を足し、
// 主人公以外の人間の子どもは描かないようにする。
const SERIES_CAST_RULES =
  "The main character is the only human child in this picture book: never draw any other human child, and never draw a second child who looks or dresses like the main character. " +
  "Do not add people who are not mentioned in this scene; crowds, onlookers and friends are the story's animals and creatures, not humans. " +
  "Each animal or creature character keeps exactly its own species and look on every page; never turn one into a person or into a different animal. " +
  "Everyone stands, sits or kneels on top of the ground; never draw a body sunk into the ground or a hole.";

// オリジナルのお話の絵で、本文と食い違わないための指示（2026-10-12 作道さん：おじいちゃんの家なのに子どもが出迎える、
// 家の中で靴、亡くなった犬がそこにいる、全員が全ページに出る、が見られた）。オリジナルのお話の全ページに付ける。
const CUSTOM_CAST_RULES =
  "Draw only the people and animals this scene names; do not add family members, companions or extra people who are not mentioned, and never draw the same character twice. " +
  "Keep who is the host and who is the visitor exactly as described. Indoors in a Japanese home, nobody wears outdoor shoes. " +
  "A person or animal described as passed away appears only as a memory, photo, dream or gentle spirit when the scene says so, never as if alive in the room.";

// 絵は1ページずつ別々に描くので、決めていないことはページごとに変わってしまう（服の色、バッジの数、仲間の見た目など。
// 2026-10-11 作道さん「この話に限らず統一感をもたせるプロンプトに」。後ろ姿の背中にバッジが描かれたので、前に付ける物・肩に乗る仲間・抱える物の位置もアングルによらず決める）。すべての絵本の全ページに付ける共通の決まり。
const BOOK_CONSISTENCY =
  "This picture is one page of a picture book, and every page must match the others exactly. Keep each recurring character identical on every page: " +
  "the same face, hairstyle, hair color, hair accessories and glasses, the same body proportions and height relative to the others, " +
  "the same clothes with the same colors, shapes and details, and the same accessories (badges, bags, hats) in the same number, colors and position. " +
  "Things worn or carried on the front of the body (badges, pins, front pockets, prints on a shirt) always stay in the same place on the front, with left and right meaning the character's own left and right: " +
  "never move them to the back, shoulders, sleeves or hat, and when a character is seen from behind they are hidden and must not be drawn. " +
  "The same goes for everything on the body from every camera angle: things on the back (a backpack) stay on the back, and an animal or object that rides on, is held by or is tucked into a character " +
  "(on a shoulder, in the arms, inside a coat, in a pocket or a hand) stays in that exact place on the same side; when the camera views from behind or from the side, show it only where that place would really be visible from there. " +
  "Keep recurring animals, objects and places the same shape, colors and size relative to the child. " +
  // 2026-10-12 トライアルの声「リス増えた？」：窓の外のポッケとは別に、ベッドの上にもりすが描かれた
  "Each character, including the sidekick and every named animal, appears at most once in the picture: never draw the same character twice, and never add a stuffed toy, doll, picture or look-alike animal of the same kind next to them. " +
  "Do not add accessories, logos, patterns or items to anyone's clothes beyond what is described. " +
  // 2026-10-15 作道さん（見開き版の本のレビュー）：服の説明に無いリュックが場面5・8・9だけに描かれ、ほかの場面では消えていた
  "Nobody carries a backpack, bag, satchel or basket unless the clothes, the continuity notes or this scene mention it.";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 場面の指示に出る登場人物（例：Chicchi is a tiny gray mouse ...）と、場所や物（例：the golden acorn）の見た目 */
function lookPrompt(cast: Record<string, string> | undefined, props: Record<string, string> | undefined, ...texts: (string | undefined)[]) {
  const text = texts.filter(Boolean).join(" ");
  const named = Object.entries(cast ?? {}).filter(([name]) => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text));
  // 場所や物は大文字小文字を区別しない。同じ物を別の言い方で書いたキー（同じ説明）は1回だけ
  const things = Object.entries(props ?? {})
    .filter(([key]) => new RegExp(`\\b${escapeRegExp(key)}\\b`, "i").test(text))
    .filter(([, look], i, all) => all.findIndex(([, l]) => l === look) === i);
  return [
    named.length ? `Who is who in this scene: ${named.map(([name, look]) => `${name} is ${look}`).join("; ")}.` : "",
    things.length ? `Recurring places and objects, always drawn the same way: ${things.map(([key, look]) => `${key}: ${look}`).join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** その話の持ち物・身に着ける物の決まりのうち、このページ（表紙0、場面1〜12）に当てはまるもの */
function continuityPrompt(continuity: Continuity[] | undefined, page: number) {
  const rules = (continuity ?? []).filter((c) => (c.from ?? 0) <= page && page <= (c.to ?? 99)).map((c) => c.text);
  return rules.length ? `Continuity for this page: ${rules.join(" ")}` : "";
}

/** 相棒の名前（例：Pokke）。相棒の説明文の最初の語 */
function sidekickName(sidekick: string) {
  return sidekick.split(/[ ,]/)[0];
}

// 台本のシリーズは、話ごとに服装（形と色）を決めてある。参考画像の服ではなくこの服で、全ページ同じにする。
// 以前は「参考画像と同じ色の冬服」とだけ伝えていて、ページごとにコートの色や形が変わった（2026-10-11 作道さんの指摘）。
function outfitsPrompt(outfits: string) {
  return `Clothes in this book: ${outfits} Draw these exact clothes in these exact colors on every page instead of the clothes in the reference images, so each person looks the same throughout the book; change clothes only when the continuity notes or the scene clearly say so (such as pajamas in bed or a towel).`;
}

/** 印刷用の本文の絵の大きさ（1辺のpx）。OPENAI_FINAL_SIZE（例 2048x2048）で変えられる */
export const FINAL_PX = Number((process.env.OPENAI_FINAL_SIZE ?? "2048x2048").split("x")[0]) || 2048;

// 参考画像（写真や設定画）の絵柄に引っぱられて、テイストの違いが消えないようにする指示
const STYLE_ONLY_FROM_TEXT =
  "Use the reference images only to know who the people are (faces, hairstyles, outfits). Ignore their drawing style, rendering, texture and color palette, " +
  "and render the whole image strictly in the ART STYLE described above. The style must be unmistakable at a glance.";

const LABEL: Record<Person, string> = {
  child: "the child (the main character)",
  mom: "the child's mother",
  dad: "the child's father",
};

// 年齢ごとの体つき（写真が顔だけでも、絵の中で年齢に合った背丈・頭身にするため）
export function ageBody(age: number) {
  const build =
    age <= 1 ? "a baby who has just started to toddle, with a big head (about 1:4 head-to-body), chubby cheeks, short arms and legs and a round tummy"
    : age <= 3 ? "a small toddler with a big head (about 1:4.5 head-to-body), chubby cheeks and short, sturdy limbs"
    : age <= 6 ? "a preschooler with a fairly big head (about 1:5 head-to-body), soft round cheeks and a small body"
    : age <= 8 ? "an early elementary school child (about 1:5.5 head-to-body) with longer arms and legs and a slimmer face"
    : "an older elementary school child (about 1:6 head-to-body), taller and slimmer, with long arms and legs";
  return `The child is ${age} year${age === 1 ? "" : "s"} old: draw them as ${build}, at a height that fits that age next to the adults.`;
}

/** 絵に出る人：主人公・ママ・パパか、オリジナルのお話のほかの登場人物（cast の番号・0から） */
export type Who = Person | number;

/** 絵の指示での呼び名。ほかの登場人物は Companion 1, 2, ...（お話の絵の内容と同じ） */
function labelOf(who: Who) {
  return typeof who === "number" ? `Companion ${who + 1}` : LABEL[who];
}

/** 参考画像：写真か、写真から作ったキャラクターの絵（previous は作り直す前の同じキャラクター） */
export type RefKind = "photo" | "character" | "previous";
export type RefImage = { who: Who; kind?: RefKind; file: Uploadable };

/** 作り直しの指示（選択肢と一言） */
export type Redo = {
  options: RedoOptionId[];
  note: string;
  likeness?: LikenessId;
  /** 最初に作るとき（作り直しではない）。写真の画面で選んだ似せ方だけを伝える */
  initial?: boolean;
};

/** 作り直しに中身があるか（選択肢・一言・似せ方のどれか） */
export function hasRedoRequest(redo?: Redo | null): redo is Redo {
  return !!redo && (redo.options.length > 0 || !!redo.note.trim() || (!!redo.likeness && redo.likeness !== "normal"));
}

function describeRefs(refs: { who: Who; kind?: RefKind }[]) {
  return refs
    .map((r, i) => {
      const n = `Reference image ${i + 1}`;
      if (r.kind === "character") {
        return `${n} is the approved picture-book character design of ${labelOf(r.who)}: keep exactly the same face, hairstyle, hair color and body proportions, and the same outfit unless this prompt describes different clothes.`;
      }
      if (r.kind === "previous") return `${n} is the previous version of this drawing of ${labelOf(r.who)}.`;
      return `${n} is a photo of ${labelOf(r.who)}.`;
    })
    .join(" ");
}

function redoPrompt(redo?: Redo | null) {
  if (!redo) return "";
  const opts = redo.options.map((id) => REDO_OPTIONS.find((o) => o.id === id)?.prompt).filter(Boolean);
  const likeness = LIKENESS_LEVELS.find((l) => l.id === redo.likeness)?.prompt ?? "";
  const note = redo.note.trim();
  return [
    hasRedoRequest(redo) && !redo.initial ? "This is a redo requested by the customer." : "",
    likeness,
    ...opts,
    note ? `The customer also wrote this request in Japanese; follow it as long as it fits a gentle children's picture book: 「${note}」` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** キャラクター（1人の全身・正面の絵）を描く指示。プレビューで見せ、本番の絵の参考にする。 */
export function buildCharacterPrompt(taste: TasteId, who: Who, refs: { who: Who; kind?: RefKind }[], childAge?: number | null, redo?: Redo | null, story?: string) {
  const t = getTaste(taste)!;
  const book = getBook(story);
  // 台本のシリーズは、キャラクターの絵もその話の服で描く（本文の絵の参考になるので、服がずれないように）
  const outfits = book?.series?.outfits;
  const hasPrevious = refs.some((r) => r.kind === "previous");
  if (typeof who === "number") return guestCharacterPrompt(t.prompt, who, book?.cast?.[who], refs, redo, hasPrevious);
  return [
    `${t.prompt}.`,
    describeRefs(refs),
    STYLE_ONLY_FROM_TEXT,
    PICTURE_BOOK_CHARACTERS,
    "Make them look friendly and natural, never caricatured.",
    who === "child" && childAge ? ageBody(childAge).replace(", at a height that fits that age next to the adults", "") : "",
    `Character design of ${LABEL[who]} only, for a children's picture book: one person standing alone, full body from head to toes, front view, relaxed natural pose, friendly expression, ${outfits ? "wearing this person's clothes from this list" : "simple everyday clothes"}.`,
    outfits ? `Clothes: ${outfits} Draw exactly these clothes and colors instead of the clothes in the reference images.` : "",
    "Plain soft light background with no scenery and no other people or animals. Leave a little space above the head and below the feet.",
    hasPrevious
      ? redo?.likeness && redo.likeness !== "normal"
        ? "Keep the outfit, colors and overall look of the previous version, but redraw the face and hair from the photo so the person looks more like the photo, and change what the requests below ask to change."
        : "Keep everything from the previous version except what the requests below ask to change."
      : "",
    redoPrompt(redo),
    "Do not draw any letters, words or text in the image.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** オリジナルのお話の、ほかの登場人物（ペットやおばあちゃんなど）のキャラクターの絵の指示 */
function guestCharacterPrompt(style: string, i: number, member: { kind: "person" | "animal"; look: string } | undefined, refs: { who: Who; kind?: RefKind }[], redo: Redo | null | undefined, hasPrevious: boolean) {
  const animal = member?.kind === "animal";
  const hasPhoto = refs.some((r) => r.kind === "photo");
  return [
    `${style}.`,
    describeRefs(refs),
    STYLE_ONLY_FROM_TEXT,
    animal
      ? "Turn the animal into a hand-drawn picture-book character, not a realistic photo: soft simplified shapes and expressive friendly eyes" +
        (hasPhoto ? ", while keeping the breed, size, fur color, fur length, markings and ear and tail shape from the photo so the family recognizes their own pet at a glance." : ".")
      : PICTURE_BOOK_CHARACTERS,
    "Make them look friendly and natural, never caricatured.",
    `Character design of ${labelOf(i)}${member ? ` (${member.look})` : ""} only, for a children's picture book: ` +
      (animal
        ? "the animal alone, full body from head to tail, standing in a natural relaxed pose, friendly expression."
        : "one person standing alone, full body from head to toes, front view, relaxed natural pose, friendly expression, simple everyday clothes."),
    "Plain soft light background with no scenery and no other people or animals. Leave a little space around the whole body.",
    hasPrevious
      ? redo?.likeness && redo.likeness !== "normal"
        ? `Keep the overall look of the previous version, but redraw ${animal ? "the face, fur and markings" : "the face and hair"} from the photo so it looks more like the photo, and change what the requests below ask to change.`
        : "Keep everything from the previous version except what the requests below ask to change."
      : "",
    redoPrompt(redo),
    "Do not draw any letters, words or text in the image.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** オリジナルのお話で、この絵に出る・出ない「ほかの登場人物」の指示 */
function guestsPrompt(cast: { kind: "person" | "animal"; look: string }[] | undefined, guests: number[] | undefined) {
  if (!cast?.length) return "";
  const present = (guests ?? []).filter((g) => cast[g]);
  const absent = cast.map((_, g) => g).filter((g) => !present.includes(g));
  return [
    present.length
      ? `Also in this picture: ${present.map((g) => `${labelOf(g)} is ${cast[g].look}`).join("; ")}. Draw each companion exactly like their character design reference image, keeping the same look on every page; never turn a companion into a different person or animal.`
      : "",
    absent.length ? `Do not include ${absent.map(labelOf).join(" or ")} in this picture.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** 見開きの絵（横長 3:2）を印刷用に拡大するときの大きさ */
const SPREAD_FINAL = { width: Math.round(FINAL_PX * 1.5), height: FINAL_PX };

/** spread：本文の場面を見開き（横長）で描く（2026-10-15 作道さん：お客様の本も見開き版に切り替え） */
export function buildPrompt(taste: TasteId, story: string, sceneIndex: number, refs: { who: Who; kind?: RefKind }[], childAge?: number | null, redo?: Redo | null, spread = false) {
  const t = getTaste(taste)!;
  const isCover = sceneIndex === COVER_SCENE;
  const book = getBook(story)!;
  const scene: BookScene = isCover
    ? { text: "", art: book.cover, withSidekick: book.coverWithSidekick, camera: book.coverCamera, guests: book.coverGuests }
    : book.scenes[sceneIndex];
  const series = book.series;
  const people = [...new Set(refs.map((r) => r.who))];
  const generic = [
    scene.withMom && !people.includes("mom") ? "the mother" : null,
    scene.withDad && !people.includes("dad") ? "the father" : null,
  ].filter(Boolean);
  const absent = [
    !scene.withMom && people.includes("mom") ? "the mother" : null,
    !scene.withDad && people.includes("dad") ? "the father" : null,
  ].filter(Boolean);
  return [
    `${t.prompt}.`,
    describeRefs(refs),
    STYLE_ONLY_FROM_TEXT,
    PICTURE_BOOK_CHARACTERS,
    "Make them look friendly and natural, never caricatured.",
    childAge ? ageBody(childAge) : "",
    BOOK_CONSISTENCY,
    series?.outfits ? outfitsPrompt(series.outfits) : "",
    series ? continuityPrompt(series.continuity, isCover ? 0 : sceneIndex + 1) : "",
    series
      ? scene.withSidekick
        ? `The sidekick of this picture book series appears: ${series.sidekick}. Keep the sidekick looking the same on every page.`
        : `Do not include ${sidekickName(series.sidekick)} (the sidekick) in this scene.`
      : "",
    book.facts ? `Facts of this story that every picture must respect: ${book.facts}` : "",
    scene.setting ? `Setting: ${scene.setting}.` : "",
    `Scene: ${scene.art}.`,
    series ? lookPrompt(series.cast, series.props, scene.art, scene.camera) : "",
    series ? SERIES_CAST_RULES : "",
    !series && book.cast ? CUSTOM_CAST_RULES : "",
    guestsPrompt(book.cast, scene.guests),
    redoPrompt(redo),
    generic.length ? `${generic.join(" and ")} appear in this scene; draw them as gentle adults without a specific likeness.` : "",
    absent.length ? `Do not include ${absent.join(" or ")} in this scene.` : "",
    cameraPrompt(scene.camera),
    isCover
      ? "This is the front cover of the picture book: a wide landscape composition with the child large and clearly visible near the center, the scene filling the whole frame. Do not draw any letters, words, title or text in the image."
      : spread
        ? spreadFraming(sceneTextSide(sceneIndex))
        : framing(scene.camera),
  ]
    .filter(Boolean)
    .join(" ");
}

/** 参考写真（とキャラクター）から1場面の挿絵、またはキャラクターの絵を作り、PNG の base64 を返す。 */
export async function illustrate(opts: {
  taste: TasteId;
  /** お話の番号（旧版のお話か、シリーズの "forest:2:n:mom" など） */
  story: string;
  sceneIndex: number;
  images: RefImage[];
  quality: Quality;
  /** 絵の細かさ（AIの画質）。省略時は、印刷用（final）は高画質、それ以外は中画質 */
  detail?: Detail;
  childAge?: number | null;
  redo?: Redo | null;
  /** 出力サイズを指定するとき（画質くらべ用）。省略時は品質と場面から決める */
  size?: "1024x1024" | "2048x2048";
  /** 写真の顔の飾り（シール・メガネなど）を描かない */
  plainFace?: boolean;
  /** 本文の場面を見開き（横長 1536x1024）で描く。表紙・キャラクターの絵には効かない */
  spread?: boolean;
}): Promise<string> {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  // 印刷用の本文の絵は、1024px・最高画質で作ってから印刷サイズに拡大する（A方式）。
  // 2048px で直接作るより約6割安く、2026-10-10 の画質くらべで見分けがつかないことを確認済み。
  const isCover = opts.sceneIndex === COVER_SCENE;
  const guest = guestOf(opts.sceneIndex);
  const character: Who | null = characterOf(opts.sceneIndex) ?? guest;
  const upscaleTo = !opts.size && !isCover && character === null && opts.quality === "final" ? FINAL_PX : null;
  const spread = !!opts.spread && !opts.size && !isCover && character === null;
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: opts.images.map((i) => i.file),
    prompt: [
      character !== null
        ? buildCharacterPrompt(opts.taste, character, opts.images, opts.childAge, opts.redo, opts.story)
        : buildPrompt(opts.taste, opts.story, opts.sceneIndex, opts.images, opts.childAge, opts.redo, spread),
      opts.plainFace ? PLAIN_FACE : "",
    ]
      .filter(Boolean)
      .join(" "),
    // 表紙は横長（タイトルは絵の上の帯に置くので、絵に文字の場所はいらない）
    size: opts.size ?? (isCover ? COVER_SIZE : spread ? "1536x1024" : "1024x1024"),
    quality: opts.detail ?? (opts.quality === "final" ? "high" : "medium"),
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  if (upscaleTo && spread) return upscalePng(b64, SPREAD_FINAL.width, SPREAD_FINAL.height);
  return upscaleTo ? upscalePng(b64, upscaleTo) : b64;
}

/** 印刷用の大きさに拡大する（プレビューの絵をそのまま本にするとき）。見開きの絵（横長）は横長のまま */
export async function upscaleForPrint(b64: string, wide: boolean) {
  return wide ? upscalePng(b64, SPREAD_FINAL.width, SPREAD_FINAL.height) : upscalePng(b64, FINAL_PX);
}

// --- 作例（トップページなどに載せる見本の絵）---
// 実在しない家族で描く。お話ごとに「キャラクター設定画」を1枚作り、そのお話の見本はすべて
// それを参考に描く（テイストが違っても、顔・体つき・服装は同じにする）。
// 2026-10-12 作道さん「本人に似せたい」：設定画も見本も、トップの「この写真から」①の家族写真（SHOWCASE_PHOTO）に
// 写真そっくりで寄せて描く（お客様の写真から絵本ができる流れと同じに見せる）。

/** 写真が先の見本で、設定画・場面を家族写真に寄せる指示（作り直しの「写真そっくり」と同じ） */
const PHOTO_LIKENESS = LIKENESS_LEVELS.find((l) => l.id === "exact")!.prompt;

/** 作例の家族写真の並び（トップの①・森のサンプル集で共通） */
const SHOWCASE_PHOTO_ORDER = "the mother on the left, the child (the main character) in the middle and the father on the right";

const SAMPLE_CAST: Record<Person, string> = {
  child: "a cheerful five-year-old Japanese boy with short black hair with a small cowlick, round cheeks and a bright smile",
  mom: "a gentle Japanese woman in her thirties with shoulder-length dark brown hair",
  dad: "a kind Japanese man in his thirties with short black hair and round black glasses",
};

// 作例とは別の家族で見本を描くシリーズ（名前は series.ts の seriesSampleChildName）。2026-10-12 作道さん：数のお勉強は3歳くらいの女の子、ママ・パパは今の家族とはっきり違う見た目に
const SERIES_SAMPLE_CAST: Partial<Record<keyof typeof SAMPLE_OUTFITS, Record<Person, string>>> = {
  number: {
    child: "a cheerful three-year-old Japanese girl, small with a toddler's build, with chin-length dark brown hair in two short pigtails tied with plain yellow hair ties, straight bangs, round rosy cheeks and big bright eyes",
    mom: "a lively Japanese woman in her thirties with very short black pixie-cut hair and a wide warm smile, no glasses",
    dad: "a tall, friendly Japanese man in his thirties with slightly wavy medium-length brown hair and a short neat beard, no glasses",
  },
};

// お話ごとの服装（同じお話の中では変えない）
const SAMPLE_OUTFITS: Record<StoryId | "sea" | "dinosaur" | "number", Record<Person, string>> = {
  forest: {
    child: "a mustard-yellow hooded jacket, navy shorts, white socks, red sneakers and a small green backpack",
    mom: "a light-green cardigan over a white T-shirt, beige wide pants and white sneakers",
    dad: "a navy-and-white checked shirt, khaki pants and brown walking boots",
  },
  star: {
    child: "light-blue pajamas with small yellow stars and bare feet",
    mom: "a cream knit cardigan over a long navy dress",
    dad: "a grey hoodie and dark blue sweatpants",
  },
  birthday: {
    child: "a white shirt with a red bow tie, navy shorts with suspenders and a striped paper party hat",
    mom: "a coral dress with a small white collar",
    dad: "a light-blue shirt with rolled-up sleeves and beige chinos",
  },
  // 台本のシリーズで増えたお話（作例スタジオには無く、絵スタジオで使う）
  sea: {
    child: "a blue-and-white striped T-shirt, red shorts, a yellow sun hat and blue sandals",
    mom: "a white linen blouse, light-blue wide pants and straw sandals",
    dad: "a coral-colored polo shirt, beige shorts and navy sneakers",
  },
  dinosaur: {
    child: "an orange T-shirt, olive-green shorts, a khaki explorer hat and brown boots",
    mom: "a mustard-yellow knit top, dark green pants and brown boots",
    dad: "a light-brown safari shirt, navy pants and hiking boots",
  },
  number: {
    child: "a light-green zip-up hoodie, a white T-shirt, beige pants and yellow sneakers",
    mom: "a pale-pink knit sweater and light-blue jeans",
    dad: "a white-and-navy striped long-sleeved shirt and khaki pants",
  },
};

function sampleCast(story: keyof typeof SAMPLE_OUTFITS, people: Person[], withOutfits = true) {
  const role: Record<Person, string> = { child: "The main character", mom: "The mother", dad: "The father" };
  const cast = SERIES_SAMPLE_CAST[story] ?? SAMPLE_CAST;
  return people.map((p) => `${role[p]}: ${cast[p]}${withOutfits ? `, wearing ${SAMPLE_OUTFITS[story][p]}` : ""}.`).join(" ");
}

/** 服装だけを伝える（顔・髪は写真から取るので、文章の見た目は書かない） */
function sampleOutfits(story: keyof typeof SAMPLE_OUTFITS, people: Person[]) {
  const role: Record<Person, string> = { child: "The main character", mom: "The mother", dad: "The father" };
  return people.map((p) => `${role[p]} wears ${SAMPLE_OUTFITS[story][p]}.`).join(" ");
}

/** お話ごとのキャラクター設定画を作る（作例の家族写真の3人を写真そっくりに、全身・正面、白い背景）。 */
export async function makeCharacterSheet(story: StoryId, photo: Uploadable) {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: [photo],
    prompt: [
      "Character reference sheet for a children's picture book.",
      `The reference image is a photo of the real family: ${SHOWCASE_PHOTO_ORDER}. Draw these three people as picture-book characters.`,
      PHOTO_LIKENESS,
      `Dress them for this story. ${sampleOutfits(story, ["child", "mom", "dad"])}`,
      "Show the three characters standing side by side, full body, front view, on a plain white background, at heights that fit their ages.",
      "Simple, warm picture-book character design with clear shapes and flat colors so the faces, hairstyles and outfits are easy to copy.",
      "Do not draw any letters, words or text.",
    ].join(" "),
    size: "1024x1024",
    quality: "high",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}

export function buildSamplePrompt(taste: TasteId, story: StoryId, sceneIndex: number) {
  const t = getTaste(taste)!;
  const scene = getStory(story)!.scenes[sceneIndex];
  const people: Person[] = ["child", ...(scene.withMom ? (["mom"] as const) : []), ...(scene.withDad ? (["dad"] as const) : [])];
  return [
    `${t.prompt}.`,
    "The reference image is the character sheet for this story.",
    "Draw exactly the same characters: the same faces, hairstyles, body proportions, outfits and outfit colors. Only the drawing style changes.",
    STYLE_ONLY_FROM_TEXT,
    // 設定画はどのテイストでも同じ1枚なので、その平たい塗りに引っぱられて3つのテイストが似てしまわないようにする
    "The character sheet is drawn in a plain neutral style; do not keep any of its look. Someone comparing this picture with the same scene in watercolor, crayon and anime styles must instantly see which one it is.",
    `The second reference image is a photo of the real family these characters were drawn from (${SHOWCASE_PHOTO_ORDER}). Keep each person's face, hairstyle and hair color as close to that photo as possible, translated into the picture-book style; take only faces and hair from the photo, not its clothes, background or pose.`,
    sampleOutfits(story, people),
    `Scene: ${scene.art}.`,
    scene.withMom ? "" : "Do not include the mother in this scene.",
    scene.withDad ? "" : "Do not include the father in this scene.",
    "Do not copy the white background or the side-by-side layout of the character sheet.",
    SQUARE_FRAMING,
  ]
    .filter(Boolean)
    .join(" ");
}

/** キャラクター設定画と作例の家族写真をもとに作例の1場面を作り、PNG の base64 を返す。 */
export async function illustrateSample(opts: { taste: TasteId; story: StoryId; sceneIndex: number; quality: Quality; sheet: Uploadable; photo: Uploadable }) {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: [opts.sheet, opts.photo],
    prompt: buildSamplePrompt(opts.taste, opts.story, opts.sceneIndex),
    size: "1024x1024",
    quality: opts.quality === "final" ? "high" : "medium",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}

// --- 「この写真から → この絵本に」の見本 ---

/** 架空の家族の、スマホで撮ったような写真風の画像を作る。 */
export async function makeShowcasePhoto() {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const result = await ai.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    prompt: [
      "A natural, candid smartphone photo of a fictional Japanese family of three in a sunny park.",
      "In the center, a cheerful child of about five with short black hair and round cheeks.",
      "On the left, the mother in her thirties with shoulder-length dark brown hair. On the right, the father in his thirties with short black hair and round glasses.",
      "All three smile at the camera, faces clearly visible, soft daylight, realistic photo, no text.",
    ].join(" "),
    size: "1024x1024",
    quality: "medium",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}

/** 写真風の画像から、絵本の1場面を作る（家族3人が1枚に写っている写真を参考にする）。 */
export async function illustrateShowcase(opts: { taste: TasteId; story: StoryId; sceneIndex: number; photo: Uploadable }) {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const t = getTaste(opts.taste)!;
  const scene = getStory(opts.story)!.scenes[opts.sceneIndex];
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: [opts.photo],
    prompt: [
      `${t.prompt}.`,
      `The reference photo shows the family: ${SHOWCASE_PHOTO_ORDER}.`,
      STYLE_ONLY_FROM_TEXT,
      PHOTO_LIKENESS,
      // 森の見本（設定画・27枚・サンプル集）と同じ服にそろえる
      `Dress them for this story. ${sampleOutfits(opts.story, ["child", "mom", "dad"])}`,
      "Make them look friendly and natural, never caricatured. The result must clearly look like a page from a children's picture book, not a filtered photo.",
      `Scene: ${scene.art}.`,
      SQUARE_FRAMING,
    ].join(" "),
    size: "1024x1024",
    quality: "medium",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}

/** 見本の絵を表紙にした、製本済みのハードカバー絵本の商品写真風の画像を作る（トップの一番上に出す）。 */
export async function makeHeroBookPhoto(opts: { title: string; cover: Uploadable }) {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: [opts.cover],
    prompt: [
      "A photorealistic professional product photograph of a finished, printed hardcover children's picture book, as sold in a bookshop.",
      "The reference image is the front cover illustration: print it edge to edge on the cover with a soft matte laminated finish, keeping the illustration and characters exactly as they are.",
      `Print the Japanese title 「${opts.title}」 near the top of the cover in large, rounded, friendly navy-blue lettering with a thin white outline. Use exactly these characters and no other text.`,
      "The book is square, standing upright on a surface, turned about 25 degrees toward the camera so the front cover and the spine are both visible.",
      "Show real hardcover details: thick rigid boards with slightly rounded corners, a rounded spine with a hinge groove, and the cream-colored page block visible along the top edge.",
      "Soft natural daylight from the upper left, a gentle realistic contact shadow under the book, subtle sheen on the cover, high detail, shallow depth of field.",
      "Plain seamless pale sky-blue studio backdrop (#bfe0f5) that fills the entire background and the surface, with no other objects.",
      "The book is centered and fills about 65% of the frame, with generous empty space around it.",
    ].join(" "),
    size: "1024x1024",
    quality: "high",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}

// --- 台本（シリーズ）の絵 ---
// 作例と同じ架空の家族で、シリーズの各話の表紙と12場面を描く。家族はお話の作例の設定画（服装も同じ）を
// もとにし、相棒（森ならりすのポッケ）を加えた「シリーズの設定画」を1枚作って、全場面でそれを参考にする。
// 作例の設定画が無いシリーズ（海・恐竜）は、家族と相棒の設定画を文章から作る。
// 写真が先のシリーズ（数のお勉強）は、架空の家族写真を先に作り、設定画と場面はその写真に寄せて描く。

/**
 * シリーズの設定画（家族3人＋相棒）を作る。familySheet はお話の作例の設定画（無ければ文章から描く）。
 * familyPhoto があれば（写真が先のシリーズ）、その写真の3人を写真そっくりに絵にする
 */
export async function makeSeriesSheet(series: StudioSeries, familySheet: Uploadable | null, note?: string, familyPhoto?: Uploadable | null) {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const common = [
    "Show all four characters side by side, full body, front view, on a plain white background, at heights that fit them.",
    "Simple, warm picture-book character design with clear shapes and flat colors so the faces, hairstyles, outfits and the sidekick are easy to copy.",
    "Do not draw any letters, words or text.",
    seriesNote(note),
  ];
  const result = familyPhoto
    ? await ai.images.edit({
        model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
        image: [familyPhoto],
        prompt: [
          "Character reference sheet for a children's picture book series.",
          "The reference image is a photo of the real family: the mother on the left, the child in the middle and the father on the right. Draw these three people as picture-book characters.",
          PHOTO_LIKENESS,
          `Dress them for the book: the child wears ${SAMPLE_OUTFITS[series.id].child}; the mother wears ${SAMPLE_OUTFITS[series.id].mom}; the father wears ${SAMPLE_OUTFITS[series.id].dad}.`,
          `Add the series sidekick standing next to the child: ${series.sidekick}.`,
          ...common,
        ]
          .filter(Boolean)
          .join(" "),
        size: "1536x1024",
        quality: "high",
        output_format: "png",
      })
    : familySheet
    ? await ai.images.edit({
        model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
        image: [familySheet],
        prompt: [
          "Character reference sheet for a children's picture book series.",
          "The reference image shows the family: keep the child, the mother and the father exactly the same (faces, hairstyles, body proportions, outfits and colors).",
          `Add the series sidekick standing next to the child: ${series.sidekick}.`,
          ...common,
        ]
          .filter(Boolean)
          .join(" "),
        size: "1536x1024",
        quality: "high",
        output_format: "png",
      })
    : await ai.images.generate({
        model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
        prompt: [
          "Character reference sheet for a children's picture book series about a fictional Japanese family.",
          sampleCast(series.id, ["child", "mom", "dad"]),
          `The series sidekick stands next to the child: ${series.sidekick}.`,
          ...common,
        ]
          .filter(Boolean)
          .join(" "),
        size: "1536x1024",
        quality: "high",
        output_format: "png",
      });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}

/** 自分の写真で試すとき、写真の人（ひとり1枚）の並び。例：image 1 is a photo of the child (the main character) */
function ownPhotosPrompt(people: Person[], first: number) {
  return people.map((p, i) => `Reference image ${first + i} is a real photo of ${LABEL[p]}.`).join(" ");
}

/**
 * 絵スタジオ「自分の写真で試す」：写真の人（主人公と、写真があればママ・パパ）を写真そっくりに絵にして、相棒を加えた設定画を作る。
 * 服はそのシリーズの見本と同じ。いない人は描かない
 */
export async function makeOwnSeriesSheet(series: StudioSeries, photos: { who: Person; file: Uploadable }[], note?: string) {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const people = photos.map((p) => p.who);
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: photos.map((p) => p.file),
    prompt: [
      "Character reference sheet for a children's picture book series.",
      ownPhotosPrompt(people, 1),
      `Draw ${people.length === 1 ? "this person" : `these ${people.length} people`} as picture-book characters.`,
      PHOTO_LIKENESS,
      "Take only faces, hairstyles, hair colors and body proportions from the photos, not their clothes, backgrounds or poses.",
      sampleOutfits(series.id, people),
      `Add the series sidekick standing next to the child: ${series.sidekick}.`,
      "Show all characters side by side, full body, front view, on a plain white background, at heights that fit them.",
      "Simple, warm picture-book character design with clear shapes and flat colors so the faces, hairstyles, outfits and the sidekick are easy to copy.",
      "Do not draw anyone who is not in the photos. Do not draw any letters, words or text.",
      seriesNote(note),
    ]
      .filter(Boolean)
      .join(" "),
    size: "1536x1024",
    quality: "high",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}

/**
 * 写真が先のシリーズで、最初に作る架空の家族写真（文章の家族から）。設定画と場面はこの写真に寄せて描く。
 * サンプル集では左からママ・主人公・パパの順に名前を付けて表示する。
 */
export async function makeSeriesFamilyPhotoFromText(series: StudioSeries, note?: string) {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const result = await ai.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    prompt: [
      "A natural, candid smartphone photo of a real Japanese family of three in a sunny park, as if taken by a friend.",
      sampleCast(series.id, ["child", "mom", "dad"], false),
      "They wear everyday casual clothes.",
      "They stand side by side in a row, evenly spaced across the frame, in this exact order from left to right: the mother on the left third, the child in the middle, the father on the right third. The child stands in front, between the parents.",
      "All three smile at the camera, faces clearly visible and not overlapping, upper bodies in the frame, soft daylight, realistic photo, no text. Do not include any animal.",
      seriesNote(note),
    ]
      .filter(Boolean)
      .join(" "),
    size: "1536x1024",
    quality: "high",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}

/**
 * サンプル集の「この写真から → この登場人物に」用に、シリーズの設定画の家族3人にそっくりな架空の家族写真を作る。
 * サンプル集の画面は、左からママ・主人公・パパの順に並んでいる前提で名前を付けて表示する。
 */
export async function makeSeriesFamilyPhoto(sheet: Uploadable, note?: string) {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: [sheet],
    prompt: [
      "A natural, candid smartphone photo of a real Japanese family of three in a sunny park, as if taken by a friend.",
      "The reference image is a picture-book character sheet. The photo shows the real people these characters were drawn from: the child, the mother and the father must clearly look like their characters (the same hairstyles, hair colors, glasses, face shapes and body proportions), but as real people, not drawings.",
      "They wear everyday casual clothes in similar colors to the character sheet.",
      "Do not include the animal sidekick or any animal.",
      "They stand side by side in a row, evenly spaced across the frame, in this exact order from left to right: the mother on the left third, the child in the middle, the father on the right third. The child stands in front, between the parents.",
      "All three smile at the camera, faces clearly visible and not overlapping, upper bodies in the frame, soft daylight, realistic photo, no text.",
      seriesNote(note),
    ]
      .filter(Boolean)
      .join(" "),
    size: "1536x1024",
    quality: "high",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}

/** 絵スタジオで1枚ごとに書く追加の指示（日本語でよい）。ほかの指示より優先させるため最後に置く */
function seriesNote(note?: string) {
  const n = note?.trim().slice(0, SERIES_NOTE_MAX);
  return n ? `Additional instructions from the art director (may be written in Japanese); follow them carefully, they take priority over the instructions above: ${n}` : "";
}

export function buildSeriesPrompt(series: StudioSeries, scene: SeriesScene, opts: { cover: boolean; page: number; outfits?: string; continuity?: Continuity[]; note?: string; withPhoto?: boolean; spread?: boolean; textSide?: "left" | "right"; ownPhotos?: Person[] }) {
  const t = getTaste("watercolor")!;
  const people: Person[] = ["child", ...(scene.withMom ? (["mom"] as const) : []), ...(scene.withDad ? (["dad"] as const) : [])];
  return [
    `${t.prompt}.`,
    "The reference image is the character sheet for this picture book series.",
    opts.outfits
      ? "Draw exactly the same characters: the same faces, hairstyles and body proportions. Only the drawing style and the clothes change."
      : "Draw exactly the same characters: the same faces, hairstyles, body proportions and outfit colors. Only the drawing style changes.",
    opts.withPhoto
      ? "The second reference image is a photo of the real family these characters were drawn from (the mother on the left, the child in the middle, the father on the right). Keep each person's face, hairstyle and hair color as close to that photo as possible, translated into the picture-book style; take only faces and hair from the photo, not its clothes, background or pose."
      : "",
    opts.ownPhotos?.length
      ? `${ownPhotosPrompt(opts.ownPhotos, 2)} Keep each person's face, hairstyle and hair color as close to their photo as possible, translated into the picture-book style; take only faces and hair from the photos, not their clothes, backgrounds or poses.`
      : "",
    STYLE_ONLY_FROM_TEXT,
    // 写真があるときは顔・髪は写真に任せ、文章では服だけ伝える（文章の見た目と写真が食い違わないように）
    opts.withPhoto || opts.ownPhotos ? (opts.outfits ? "" : sampleOutfits(series.id, people)) : sampleCast(series.id, people, !opts.outfits),
    BOOK_CONSISTENCY,
    opts.outfits ? outfitsPrompt(opts.outfits) : "",
    continuityPrompt(opts.continuity, opts.page),
    scene.withSidekick
      ? `The sidekick appears: ${series.sidekick}. Keep the sidekick exactly as on the character sheet.`
      : `Do not include ${sidekickName(series.sidekick)} (the sidekick) in this scene.`,
    `Scene: ${scene.art}.`,
    lookPrompt(series.cast, series.props, scene.art, scene.camera),
    SERIES_CAST_RULES,
    scene.withMom ? "" : "Do not include the mother in this scene.",
    scene.withDad ? "" : "Do not include the father in this scene.",
    "Do not copy the white background or the side-by-side layout of the character sheet.",
    cameraPrompt(scene.camera),
    opts.cover
      ? "This is the front cover of the picture book: a wide landscape composition with the child large and clearly visible near the center, the scene filling the whole frame. Do not draw any letters, words, title or text in the image."
      : opts.spread
        ? spreadFraming(opts.textSide ?? "right")
        : framing(scene.camera),
    seriesNote(opts.note),
  ]
    .filter(Boolean)
    .join(" ");
}

/** シリーズの1ページ（表紙または場面）を水彩で描き、PNG の base64 を返す。spread：見開きの試作（横長 1536x1024） */
export async function illustrateSeries(opts: { series: StudioSeries; scene: SeriesScene; page: number; outfits?: string; continuity?: Continuity[]; note?: string; quality: Quality; sheet: Uploadable; photo?: Uploadable | null; spread?: boolean; textSide?: "left" | "right"; ownPhotos?: { who: Person; file: Uploadable }[] }) {
  const cover = opts.page === 0;
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: [opts.sheet, ...(opts.photo ? [opts.photo] : []), ...(opts.ownPhotos ?? []).map((p) => p.file)],
    prompt: buildSeriesPrompt(opts.series, opts.scene, { cover, page: opts.page, outfits: opts.outfits, continuity: opts.continuity, note: opts.note, withPhoto: !!opts.photo, spread: opts.spread && !cover, textSide: opts.textSide, ownPhotos: opts.ownPhotos?.map((p) => p.who) }),
    size: cover ? COVER_SIZE : opts.spread ? "1536x1024" : "1024x1024",
    quality: opts.quality === "final" ? "high" : "medium",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}

/**
 * 見開き版の本の試作（登場人物しょうかいのページ）用に、シリーズの家族のひとりだけを全身で描く。
 * お客様の本のキャラクターの絵と同じく、その話の服で、無地の明るい背景に1人だけ
 */
export async function makeSeriesCharacter(opts: { series: StudioSeries; who: Person; outfits?: string; sheet: Uploadable; photo?: Uploadable | null; note?: string; ownPhoto?: Uploadable | null }) {
  const t = getTaste("watercolor")!;
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: [opts.sheet, ...(opts.photo ? [opts.photo] : []), ...(opts.ownPhoto ? [opts.ownPhoto] : [])],
    prompt: [
      `${t.prompt}.`,
      "The reference image is the character sheet for this picture book series.",
      opts.ownPhoto
        ? `${ownPhotosPrompt([opts.who], 2)} Keep the face, hairstyle and hair color as close to that photo as possible, translated into the picture-book style.`
        : "",
      opts.photo
        ? "The second reference image is a photo of the real family these characters were drawn from (the mother on the left, the child in the middle, the father on the right). Keep the face, hairstyle and hair color as close to that photo as possible, translated into the picture-book style."
        : "",
      STYLE_ONLY_FROM_TEXT,
      opts.photo || opts.ownPhoto ? (opts.outfits ? "" : sampleOutfits(opts.series.id, [opts.who])) : sampleCast(opts.series.id, [opts.who], !opts.outfits),
      `Character design of ${LABEL[opts.who]} only, for a children's picture book: the same person as on the character sheet, standing alone, full body from head to toes, front view, relaxed natural pose, friendly expression.`,
      opts.outfits ? `Clothes: ${opts.outfits} Draw exactly this person's clothes and colors from this list instead of the clothes in the reference images.` : "",
      "Plain soft light background with no scenery and no other people or animals. Leave a little space above the head and below the feet.",
      "Do not draw any letters, words or text in the image.",
      seriesNote(opts.note),
    ]
      .filter(Boolean)
      .join(" "),
    size: "1024x1024",
    quality: "medium",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}

/**
 * 登場人物しょうかいのページ用に、シリーズの相棒（森ならりすのポッケ）ひとりだけを全身で描く。
 * 家族のキャラクターの絵（makeSeriesCharacter）と同じ水彩で、無地の明るい背景に相棒だけ
 */
export async function makeSeriesSidekick(opts: { series: StudioSeries; sheet: Uploadable; note?: string }) {
  const t = getTaste("watercolor")!;
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: [opts.sheet],
    prompt: [
      `${t.prompt}.`,
      "The reference image is the character sheet for this picture book series.",
      STYLE_ONLY_FROM_TEXT,
      `Character design of the series sidekick only, for a children's picture book: ${opts.series.sidekick}.`,
      "The same sidekick as on the character sheet, alone, full body, front view, relaxed natural pose, friendly expression, filling about two thirds of the height of the picture.",
      "Plain soft light background with no scenery, no people and no other animals. Leave a little space above the head and below the feet.",
      "Do not draw any letters, words or text in the image.",
      seriesNote(opts.note),
    ]
      .filter(Boolean)
      .join(" "),
    size: "1024x1024",
    quality: "medium",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}

// --- デフォルメ調の試作（2026-10-13 作道さん「これくらいデフォルメされた絵柄も作ってみたい」）---
// まだお客様には出さない。管理画面の「デフォルメ試作」で、作例の家族写真から3人の登場人物を1枚に描いて見るだけ。
// 参考：幼児向けボードブックのような、大きな丸顔・太い輪郭・点や丸の目・赤いほっぺ・はっきりした塗り。
export const DEFORME_STYLE =
  "ART STYLE: a strongly simplified, chunky cartoon style like a Japanese picture book for babies and toddlers. " +
  "Big round heads about one third of the body height (two-and-a-half to three heads tall), very short round bodies and stubby arms and legs, mitten-like simple hands. " +
  "Thick, bold, slightly wobbly dark brown hand-drawn outlines around every shape. " +
  "Very simple faces: small round eyes drawn as solid black dots or simple white circles with a black dot pupil, short curved eyebrows, a tiny round nose, a big simple curved smile, " +
  "and large soft red-orange blush circles on both cheeks. Hair drawn as one simple solid shape with only a few strokes. " +
  "Bright, cheerful, flat colors painted with thick gouache or poster paint, with visible brush texture and slightly uneven edges, little or no shading, no realistic detail. " +
  "Warm, funny and lovable, instantly readable from far away. " +
  "It must NOT look like watercolor, anime, manga or realistic illustration: no detailed irises, no eye highlights, no thin lines, no gradients, no realistic proportions";

/** デフォルメ調で、作例の家族写真の3人（左からママ・子ども・パパ）を並べた登場人物の絵を1枚作る */
export async function makeDeformeCharacters(photo: Uploadable, note?: string) {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: [photo],
    prompt: [
      `${DEFORME_STYLE}.`,
      `The reference image is a photo of the real family: ${SHOWCASE_PHOTO_ORDER}.`,
      "Use the photo only to know who the people are. Keep the traits that make each person recognizable even in this simplified style: hairstyle and hair color, glasses, face shape and their clothes and colors.",
      "Ignore the photo's realism, lighting and texture and draw everything strictly in the ART STYLE above.",
      "Character lineup for a picture book: the three characters standing side by side in the same order as the photo, full body, front view, smiling, on a plain light cream background, with the child clearly smaller than the parents.",
      "Do not draw any letters, words or text.",
      seriesNote(note),
    ]
      .filter(Boolean)
      .join(" "),
    size: "1536x1024",
    quality: "high",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}
