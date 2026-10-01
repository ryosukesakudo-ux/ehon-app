import "server-only";
import type { Uploadable } from "openai/uploads";
import { getStory, getTaste, type StoryId, type TasteId } from "./catalog";
import { getOpenAI } from "./services";

export type Person = "child" | "mom" | "dad";
export type Quality = "preview" | "final";

const LABEL: Record<Person, string> = {
  child: "the child (the main character)",
  mom: "the child's mother",
  dad: "the child's father",
};

export function buildPrompt(taste: TasteId, story: StoryId, sceneIndex: number, people: Person[]) {
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
    "Keep each person's face, hairstyle and features recognizable, translated into the illustration style. Make them look friendly and natural, never caricatured.",
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
}): Promise<string> {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const result = await ai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    image: opts.images.map((i) => i.file),
    prompt: buildPrompt(opts.taste, opts.story, opts.sceneIndex, opts.images.map((i) => i.who)),
    size: opts.quality === "final" ? (process.env.OPENAI_FINAL_SIZE ?? "2048x2048") : "1024x1024",
    quality: opts.quality === "final" ? "high" : "medium",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}

// --- 作例（トップページなどに載せる見本の絵）---
// 実在しない家族で描く。写真は使わない。
const SAMPLE_CAST: Record<Person, string> = {
  child: "the main character is a cheerful Japanese child of about five with short black hair, round cheeks and a bright smile",
  mom: "the mother is a gentle Japanese woman in her thirties with shoulder-length dark brown hair",
  dad: "the father is a kind Japanese man in his thirties with short black hair and round glasses",
};

export function buildSamplePrompt(taste: TasteId, story: StoryId, sceneIndex: number) {
  const t = getTaste(taste)!;
  const scene = getStory(story)!.scenes[sceneIndex];
  const cast = [SAMPLE_CAST.child, scene.withMom ? SAMPLE_CAST.mom : null, scene.withDad ? SAMPLE_CAST.dad : null].filter(Boolean);
  return [
    `${t.prompt}.`,
    `Characters (fictional, keep them consistent): ${cast.join("; ")}.`,
    `Scene: ${scene.art}.`,
    scene.withMom ? "" : "Do not include the mother in this scene.",
    scene.withDad ? "" : "Do not include the father in this scene.",
    "Square composition with a calm area along the bottom for text. Do not draw any letters, words or text in the image.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** 写真なしで作例の1場面を作り、PNG の base64 を返す。 */
export async function illustrateSample(opts: { taste: TasteId; story: StoryId; sceneIndex: number; quality: Quality }) {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const result = await ai.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    prompt: buildSamplePrompt(opts.taste, opts.story, opts.sceneIndex),
    size: "1024x1024",
    quality: opts.quality === "final" ? "high" : "medium",
    output_format: "png",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像が生成されませんでした");
  return b64;
}
