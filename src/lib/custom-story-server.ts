import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { LEVELS, type LevelId } from "./story-key";
import { CUSTOM_SCENES, CUSTOM_TEXT_MAX, CUSTOM_TITLE_MAX, signedPayload, type CustomScene, type CustomStory } from "./custom-story";
import { getOpenAI, getSupabase } from "./services";

// オリジナルのお話：あらすじからAIで題名・12場面の文・絵の内容を作る（サーバー専用）。

/** 1人が1日に作れる回数（AIの費用の歯止め） */
export const STORY_GEN_DAILY = 10;

const TEXT_MODEL = () => process.env.OPENAI_TEXT_MODEL ?? "gpt-5-mini";

function secret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.CRON_SECRET ?? "ehon-demo";
}

export function signStory(s: Pick<CustomStory, "cover" | "scenes" | "level">) {
  return createHmac("sha256", secret()).update(signedPayload(s)).digest("base64url");
}

/** 絵の内容がサーバーで作ったままか */
export function verifyStory(s: CustomStory) {
  const a = Buffer.from(signStory(s));
  const b = Buffer.from(s.sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

const LEVEL_RULES: Record<LevelId, string> = {
  s: "1場面に1文（20〜35文字）。ひらがなとカタカナだけで、漢字は使わない。",
  n: "1場面に2〜3文（50〜90文字）。ひらがなとカタカナだけで、漢字は使わない。会話を少し入れる。",
  l: "1場面に4〜6文（100〜170文字）。小学1〜4年生で習う漢字だけを使い、漢字には必ず 漢字《かんじ》 の形でふりがなを付ける。会話や気持ちの言葉を入れる。",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "cover", "scenes"],
  properties: {
    title: { type: "string", description: `絵本の題名（ひらがな中心・${CUSTOM_TITLE_MAX}文字以内）` },
    cover: { type: "string", description: "表紙の絵の内容（英語・1〜2文）" },
    scenes: {
      type: "array",
      minItems: CUSTOM_SCENES,
      maxItems: CUSTOM_SCENES,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "art", "withMom", "withDad"],
        properties: {
          text: { type: "string", description: "その場面の本文（日本語）" },
          art: { type: "string", description: "その場面の挿絵の内容（英語・1〜2文）" },
          withMom: { type: "boolean" },
          withDad: { type: "boolean" },
        },
      },
    },
  },
} as const;

export type StoryInput = { synopsis: string; childName: string; childAge: number; level: LevelId };

/** あらすじから、題名と12場面を作る。AIが使えないデモモードでは仮のお話を返す */
export async function generateCustomStory(input: StoryInput): Promise<CustomStory> {
  const ai = getOpenAI();
  const body = ai ? await askAi(input) : demoStory(input);
  const title = [...body.title.trim()].slice(0, CUSTOM_TITLE_MAX).join("");
  const scenes: CustomScene[] = body.scenes.slice(0, CUSTOM_SCENES).map((s) => ({
    text: [...s.text.trim()].slice(0, CUSTOM_TEXT_MAX).join(""),
    art: s.art.trim().slice(0, 600),
    withMom: !!s.withMom,
    withDad: !!s.withDad,
  }));
  if (scenes.length !== CUSTOM_SCENES) throw new Error("お話を作れませんでした。もう一度お試しください");
  const story = { title, level: input.level, cover: body.cover.trim().slice(0, 600), scenes };
  return { ...story, sig: signStory(story) };
}

async function askAi(input: StoryInput) {
  const ai = getOpenAI()!;
  const level = LEVELS.find((l) => l.id === input.level)!;
  const system = [
    "あなたは日本の幼児向け絵本作家です。お客様のあらすじをもとに、子どもが主人公の、やさしくあたたかい絵本を作ります。",
    `全${CUSTOM_SCENES}場面。起承転結があり、最後はあたたかく終わること。`,
    `主人公は「${input.childName}」（${input.childAge}さい）。本文では名前をそのまま使う。`,
    `文の量：${level.name}（${level.ages}）。${LEVEL_RULES[input.level]}`,
    "こわすぎる・暴力的・性的・差別的な内容や、実在の人物・キャラクター・商品名は入れない。あらすじにあっても、子ども向けにやわらかく言いかえる。",
    "ママ（the mother）とパパ（the father）は、あらすじに出てくるときだけ登場させてよい。登場する場面は withMom / withDad を true にする。",
    "挿絵の内容（art・cover）は英語で、主人公は必ず \"the child\" と書き、名前は書かない。どの場面にも主人公が出る。絵の中に文字は入れない。毎回同じ見た目で描けるよう、主人公の服装は書かない。",
    "表紙（cover）は、お話の世界を背景に主人公が大きく描かれる横長の絵。",
  ].join("\n");
  const res = await ai.chat.completions.create({
    model: TEXT_MODEL(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: `あらすじ：${input.synopsis}` },
    ],
    response_format: { type: "json_schema", json_schema: { name: "picture_book", strict: true, schema: SCHEMA } },
  });
  const raw = res.choices[0]?.message?.content;
  if (!raw) throw new Error("お話を作れませんでした。あらすじを変えてお試しください");
  return JSON.parse(raw) as { title: string; cover: string; scenes: CustomScene[] };
}

function demoStory(input: StoryInput) {
  return {
    title: "わたしの おはなし",
    cover: "the child smiling in a bright, friendly fantasy landscape",
    scenes: Array.from({ length: CUSTOM_SCENES }, (_, i) => ({
      text: `［デモ］${input.childName}の おはなし ${i + 1}ページめ。${input.synopsis.slice(0, 30)}`,
      art: `the child in scene ${i + 1} of a gentle adventure`,
      withMom: false,
      withDad: false,
    })),
  };
}

/** 本文と題名に、絵本にふさわしくない言葉がないか（OpenAI のモデレーション）。AIが使えないときは確かめない */
export async function storyTextFlagged(s: Pick<CustomStory, "title" | "scenes">) {
  const ai = getOpenAI();
  if (!ai) return false;
  const res = await ai.moderations.create({ model: "omni-moderation-latest", input: [s.title, ...s.scenes.map((x) => x.text)].join("\n") });
  return res.results.some((r) => r.flagged);
}

/** 会員ごとの1日の回数を数える（Auth の app_metadata に日付と回数。お客様からは書き換えられない） */
export async function claimStoryGeneration(userId: string): Promise<boolean> {
  const db = getSupabase();
  if (!db) return true;
  const { data } = await db.auth.admin.getUserById(userId);
  const meta = data.user?.app_metadata ?? {};
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const used = meta.story_gen?.day === today ? Number(meta.story_gen.count) || 0 : 0;
  if (used >= STORY_GEN_DAILY) return false;
  await db.auth.admin.updateUserById(userId, { app_metadata: { ...meta, story_gen: { day: today, count: used + 1 } } });
  return true;
}
