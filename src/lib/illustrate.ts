import "server-only";
import type { Uploadable } from "openai/uploads";
import { COVER_SCENE, COVER_SIZE, REDO_OPTIONS, characterOf, getStory, getTaste, type Person, type RedoOptionId, type Scene, type StoryId, type TasteId } from "./catalog";
import { getOpenAI } from "./services";
import { upscalePng } from "./upscale";
import { SERIES, type SeriesId, type SeriesScene } from "./series";

export type { Person };

// 写真をもとに描くとき、写実的になりすぎないようにする指示（お客様の絵本と、トップの見本で共通）
const PICTURE_BOOK_CHARACTERS =
  "Turn everyone into hand-drawn picture-book characters, not realistic portraits: simplified rounded faces, soft rosy cheeks, a small simple nose, simplified hands and clothing folds, " +
  "no photographic skin texture, lighting or detail. Keep only the traits that make each person recognizable, such as hairstyle, hair color, glasses and overall look. " +
  "Draw expressive picture-book eyes with a visible colored iris, a dark pupil and a small white highlight, gently shaped eyelids and lashes where fitting. Never draw the eyes as plain black dots or simple lines.";
export type Quality = "preview" | "final";

// 本文の絵の構図。文章は左ページ（別ページ）に置くので、絵の中に文字用の空きは作らない。
// 以前は「下に文字用の空き」を指示していて、人物の足元が空白に溶けて切れることがあった。
const SQUARE_FRAMING =
  "Square composition that fills the whole frame with the scene, edge to edge. Frame the shot so every character's whole body, including the legs and feet, " +
  "fits inside the picture with a little ground visible below their feet; never crop, fade out or hide any part of their bodies at the edges. " +
  "Do not leave an empty or blank band anywhere. Do not draw any letters, words or text in the image.";

/** 印刷用の本文の絵の大きさ（1辺のpx）。OPENAI_FINAL_SIZE（例 2048x2048）で変えられる */
const FINAL_PX = Number((process.env.OPENAI_FINAL_SIZE ?? "2048x2048").split("x")[0]) || 2048;

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

/** 参考画像：写真か、写真から作ったキャラクターの絵（previous は作り直す前の同じキャラクター） */
export type RefKind = "photo" | "character" | "previous";
export type RefImage = { who: Person; kind?: RefKind; file: Uploadable };

/** 作り直しの指示（選択肢と一言） */
export type Redo = { options: RedoOptionId[]; note: string };

function describeRefs(refs: { who: Person; kind?: RefKind }[]) {
  return refs
    .map((r, i) => {
      const n = `Reference image ${i + 1}`;
      if (r.kind === "character") {
        return `${n} is the approved picture-book character design of ${LABEL[r.who]}: keep exactly the same face, hairstyle, hair color and body proportions, and the same outfit unless the scene calls for different clothes.`;
      }
      if (r.kind === "previous") return `${n} is the previous version of this drawing of ${LABEL[r.who]}.`;
      return `${n} is a photo of ${LABEL[r.who]}.`;
    })
    .join(" ");
}

function redoPrompt(redo?: Redo | null) {
  if (!redo) return "";
  const opts = redo.options.map((id) => REDO_OPTIONS.find((o) => o.id === id)?.prompt).filter(Boolean);
  const note = redo.note.trim();
  return [
    opts.length || note ? "This is a redo requested by the customer." : "",
    ...opts,
    note ? `The customer also wrote this request in Japanese; follow it as long as it fits a gentle children's picture book: 「${note}」` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** キャラクター（1人の全身・正面の絵）を描く指示。プレビューで見せ、本番の絵の参考にする。 */
export function buildCharacterPrompt(taste: TasteId, who: Person, refs: { who: Person; kind?: RefKind }[], childAge?: number | null, redo?: Redo | null) {
  const t = getTaste(taste)!;
  const hasPrevious = refs.some((r) => r.kind === "previous");
  return [
    `${t.prompt}.`,
    describeRefs(refs),
    STYLE_ONLY_FROM_TEXT,
    PICTURE_BOOK_CHARACTERS,
    "Make them look friendly and natural, never caricatured.",
    who === "child" && childAge ? ageBody(childAge).replace(", at a height that fits that age next to the adults", "") : "",
    `Character design of ${LABEL[who]} only, for a children's picture book: one person standing alone, full body from head to toes, front view, relaxed natural pose, friendly expression, simple everyday clothes.`,
    "Plain soft light background with no scenery and no other people or animals. Leave a little space above the head and below the feet.",
    hasPrevious ? "Keep everything from the previous version except what the requests below ask to change." : "",
    redoPrompt(redo),
    "Do not draw any letters, words or text in the image.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildPrompt(taste: TasteId, story: StoryId, sceneIndex: number, refs: { who: Person; kind?: RefKind }[], childAge?: number | null, redo?: Redo | null) {
  const t = getTaste(taste)!;
  const isCover = sceneIndex === COVER_SCENE;
  const s = getStory(story)!;
  const scene: Scene = isCover ? { text: "", art: s.cover } : s.scenes[sceneIndex];
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
    `Scene: ${scene.art}.`,
    redoPrompt(redo),
    generic.length ? `${generic.join(" and ")} appear in this scene; draw them as gentle adults without a specific likeness.` : "",
    absent.length ? `Do not include ${absent.join(" or ")} in this scene.` : "",
    isCover
      ? "This is the front cover of the picture book: a wide landscape composition with the child large and clearly visible near the center, the scene filling the whole frame. Do not draw any letters, words, title or text in the image."
      : SQUARE_FRAMING,
  ]
    .filter(Boolean)
    .join(" ");
}

/** 参考写真（とキャラクター）から1場面の挿絵、またはキャラクターの絵を作り、PNG の base64 を返す。 */
export async function illustrate(opts: {
  taste: TasteId;
  story: StoryId;
  sceneIndex: number;
  images: RefImage[];
  quality: Quality;
  childAge?: number | null;
  redo?: Redo | null;
  /** 出力サイズを指定するとき（画質くらべ用）。省略時は品質と場面から決める */
  size?: "1024x1024" | "2048x2048";
}): Promise<string> {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  // 印刷用の本文の絵は、1024px・最高画質で作ってから印刷サイズに拡大する（A方式）。
  // 2048px で直接作るより約6割安く、2026-10-10 の画質くらべで見分けがつかないことを確認済み。
  const isCover = opts.sceneIndex === COVER_SCENE;
  const character = characterOf(opts.sceneIndex);
  const upscaleTo = !opts.size && !isCover && !character && opts.quality === "final" ? FINAL_PX : null;
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: opts.images.map((i) => i.file),
    prompt: character
      ? buildCharacterPrompt(opts.taste, character, opts.images, opts.childAge, opts.redo)
      : buildPrompt(opts.taste, opts.story, opts.sceneIndex, opts.images, opts.childAge, opts.redo),
    // 表紙は横長（タイトルは絵の上の帯に置くので、絵に文字の場所はいらない）
    size: opts.size ?? (isCover ? COVER_SIZE : "1024x1024"),
    quality: opts.quality === "final" ? "high" : "medium",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return upscaleTo ? upscalePng(b64, upscaleTo) : b64;
}

// --- 作例（トップページなどに載せる見本の絵）---
// 実在しない家族で描く。お話ごとに「キャラクター設定画」を1枚作り、そのお話の見本はすべて
// それを参考に描く（テイストが違っても、顔・体つき・服装は同じにする）。
const SAMPLE_CAST: Record<Person, string> = {
  child: "a cheerful five-year-old Japanese boy with short black hair with a small cowlick, round cheeks and a bright smile",
  mom: "a gentle Japanese woman in her thirties with shoulder-length dark brown hair",
  dad: "a kind Japanese man in his thirties with short black hair and round black glasses",
};

// お話ごとの服装（同じお話の中では変えない）
const SAMPLE_OUTFITS: Record<StoryId, Record<Person, string>> = {
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
};

function sampleCast(story: StoryId, people: Person[]) {
  const role: Record<Person, string> = { child: "The main character", mom: "The mother", dad: "The father" };
  return people.map((p) => `${role[p]}: ${SAMPLE_CAST[p]}, wearing ${SAMPLE_OUTFITS[story][p]}.`).join(" ");
}

/** お話ごとのキャラクター設定画を作る（家族3人の全身・正面、白い背景）。 */
export async function makeCharacterSheet(story: StoryId) {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const result = await ai.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    prompt: [
      "Character reference sheet for a children's picture book about a fictional Japanese family.",
      sampleCast(story, ["child", "mom", "dad"]),
      "Show the three characters standing side by side, full body, front view, on a plain white background, at heights that fit their ages.",
      "Simple, warm picture-book character design with clear shapes and flat colors so the faces, hairstyles and outfits are easy to copy.",
      "Do not draw any letters, words or text.",
    ].join(" "),
    size: "1024x1024",
    quality: "medium",
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
    sampleCast(story, people),
    `Scene: ${scene.art}.`,
    scene.withMom ? "" : "Do not include the mother in this scene.",
    scene.withDad ? "" : "Do not include the father in this scene.",
    "Do not copy the white background or the side-by-side layout of the character sheet.",
    SQUARE_FRAMING,
  ]
    .filter(Boolean)
    .join(" ");
}

/** キャラクター設定画をもとに作例の1場面を作り、PNG の base64 を返す。 */
export async function illustrateSample(opts: { taste: TasteId; story: StoryId; sceneIndex: number; quality: Quality; sheet: Uploadable }) {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: [opts.sheet],
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
      "The reference photo shows the family: the child (the main character) in the center, the mother on the left, the father on the right.",
      STYLE_ONLY_FROM_TEXT,
      PICTURE_BOOK_CHARACTERS,
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

/** お話の作例の設定画に相棒を加えた、シリーズの設定画を作る。 */
export async function makeSeriesSheet(id: SeriesId, familySheet: Uploadable) {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const series = SERIES[id];
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: [familySheet],
    prompt: [
      "Character reference sheet for a children's picture book series.",
      "The reference image shows the family: keep the child, the mother and the father exactly the same (faces, hairstyles, body proportions, outfits and colors).",
      `Add the series sidekick standing next to the child: ${series.sidekick}.`,
      "Show all four characters side by side, full body, front view, on a plain white background, at heights that fit them.",
      "Simple, warm picture-book character design with clear shapes and flat colors so the faces, hairstyles, outfits and the sidekick are easy to copy.",
      "Do not draw any letters, words or text.",
    ].join(" "),
    size: "1536x1024",
    quality: "high",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}

export function buildSeriesPrompt(id: SeriesId, scene: SeriesScene, opts: { cover: boolean; outfits?: string }) {
  const series = SERIES[id];
  const t = getTaste("watercolor")!;
  const people: Person[] = ["child", ...(scene.withMom ? (["mom"] as const) : []), ...(scene.withDad ? (["dad"] as const) : [])];
  return [
    `${t.prompt}.`,
    "The reference image is the character sheet for this picture book series.",
    "Draw exactly the same characters: the same faces, hairstyles, body proportions and outfit colors. Only the drawing style changes.",
    STYLE_ONLY_FROM_TEXT,
    sampleCast(series.story, people),
    opts.outfits ? `In this episode they wear: ${opts.outfits}.` : "",
    scene.withSidekick ? `The sidekick appears: ${series.sidekick}. Keep him exactly as on the character sheet.` : "Do not include the squirrel sidekick in this scene.",
    `Scene: ${scene.art}.`,
    scene.withMom ? "" : "Do not include the mother in this scene.",
    scene.withDad ? "" : "Do not include the father in this scene.",
    "Do not copy the white background or the side-by-side layout of the character sheet.",
    opts.cover
      ? "This is the front cover of the picture book: a wide landscape composition with the child large and clearly visible near the center, the scene filling the whole frame. Do not draw any letters, words, title or text in the image."
      : SQUARE_FRAMING,
  ]
    .filter(Boolean)
    .join(" ");
}

/** シリーズの1ページ（表紙または場面）を水彩で描き、PNG の base64 を返す。 */
export async function illustrateSeries(opts: { id: SeriesId; scene: SeriesScene; cover: boolean; outfits?: string; quality: Quality; sheet: Uploadable }) {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: [opts.sheet],
    prompt: buildSeriesPrompt(opts.id, opts.scene, { cover: opts.cover, outfits: opts.outfits }),
    size: opts.cover ? COVER_SIZE : "1024x1024",
    quality: opts.quality === "final" ? "high" : "medium",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}
