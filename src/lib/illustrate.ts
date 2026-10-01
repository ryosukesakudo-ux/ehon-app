import "server-only";
import type { Uploadable } from "openai/uploads";
import { getStory, getTaste, type StoryId, type TasteId } from "./catalog";
import { getOpenAI } from "./services";

export type Person = "child" | "mom" | "dad";

// 写真をもとに描くとき、写実的になりすぎないようにする指示（お客様の絵本と、トップの見本で共通）
const PICTURE_BOOK_CHARACTERS =
  "Turn everyone into hand-drawn picture-book characters, not realistic portraits: simplified rounded faces, small simple eyes, a tiny nose, soft rosy cheeks, simplified hands and clothing folds, " +
  "no photographic skin texture, lighting or detail. Keep only the traits that make each person recognizable, such as hairstyle, hair color, glasses and overall look.";
export type Quality = "preview" | "final";

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

export function buildPrompt(taste: TasteId, story: StoryId, sceneIndex: number, people: Person[], childAge?: number | null) {
  const t = getTaste(taste)!;
  const scene = getStory(story)!.scenes[sceneIndex];
  const refs = people.map((p, i) => `Reference image ${i + 1} is ${LABEL[p]}.`).join(" ");
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
    refs,
    PICTURE_BOOK_CHARACTERS,
    "Make them look friendly and natural, never caricatured.",
    childAge ? ageBody(childAge) : "",
    `Scene: ${scene.art}.`,
    generic.length ? `${generic.join(" and ")} appear in this scene; draw them as gentle adults without a specific likeness.` : "",
    absent.length ? `Do not include ${absent.join(" or ")} in this scene.` : "",
    "Square composition with a calm area along the bottom for text. Do not draw any letters, words or text in the image.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** 参考写真から1場面の挿絵を作り、PNG の base64 を返す。 */
export async function illustrate(opts: {
  taste: TasteId;
  story: StoryId;
  sceneIndex: number;
  images: { who: Person; file: Uploadable }[];
  quality: Quality;
  childAge?: number | null;
}): Promise<string> {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: opts.images.map((i) => i.file),
    prompt: buildPrompt(opts.taste, opts.story, opts.sceneIndex, opts.images.map((i) => i.who), opts.childAge),
    size: opts.quality === "final" ? (process.env.OPENAI_FINAL_SIZE ?? "2048x2048") : "1024x1024",
    quality: opts.quality === "final" ? "high" : "medium",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
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
    sampleCast(story, people),
    `Scene: ${scene.art}.`,
    scene.withMom ? "" : "Do not include the mother in this scene.",
    scene.withDad ? "" : "Do not include the father in this scene.",
    "Do not copy the white background or the side-by-side layout of the character sheet.",
    "Square composition with a calm area along the bottom for text. Do not draw any letters, words or text in the image.",
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
      PICTURE_BOOK_CHARACTERS,
      "Make them look friendly and natural, never caricatured. The result must clearly look like a page from a children's picture book, not a filtered photo.",
      `Scene: ${scene.art}.`,
      "Square composition with a calm area along the bottom for text. Do not draw any letters, words or text in the image.",
    ].join(" "),
    size: "1024x1024",
    quality: "medium",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}
