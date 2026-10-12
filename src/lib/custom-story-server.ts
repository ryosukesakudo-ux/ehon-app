import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { LEVELS, type LevelId } from "./story-key";
import { CAST_ABOUT_MAX, CAST_KIND_LABEL, CAST_NAME_MAX, CUSTOM_SCENES, CUSTOM_TEXT_MAX, CUSTOM_TITLE_MAX, MAX_CAST, signedPayload, type CastInput, type CastMember, type CustomScene, type CustomStory } from "./custom-story";
import { getOpenAI, getSupabase } from "./services";

// オリジナルのお話：あらすじからAIで題名・12場面の文・絵の内容を作る（サーバー専用）。

/** 1人が1日に作れる回数（AIの費用の歯止め） */
export const STORY_GEN_DAILY = 10;

/** 文章を作るモデル。環境変数で変えられる。使えないモデルだったときは次の候補で作り直す */
const TEXT_MODELS = () => [...new Set([process.env.OPENAI_TEXT_MODEL, "gpt-5-mini", "gpt-4.1-mini"].filter((m): m is string => !!m))];

function secret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.CRON_SECRET ?? "ehon-demo";
}

export function signStory(s: Pick<CustomStory, "cover" | "scenes" | "level" | "cast" | "coverGuests">) {
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

const COMPANIONS = { type: "array", items: { type: "integer" }, description: "この絵に出る仲間（Companion）の番号。いなければ空" } as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "cover", "coverCompanions", "companions", "scenes"],
  properties: {
    title: { type: "string", description: `絵本の題名（ひらがな中心・${CUSTOM_TITLE_MAX}文字以内）` },
    cover: { type: "string", description: "表紙の絵の内容（英語・1〜2文）" },
    coverCompanions: COMPANIONS,
    companions: {
      type: "array",
      description: "仲間（Companion 1, 2, ...）の順に、絵での見た目の説明。仲間がいなければ空",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["look"],
        properties: { look: { type: "string", description: "英語・1文。種類・年代・体つきなど（服装は書かない）" } },
      },
    },
    scenes: {
      type: "array",
      description: `ちょうど${CUSTOM_SCENES}場面`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "art", "withMom", "withDad", "companions"],
        properties: {
          text: { type: "string", description: "その場面の本文（日本語）" },
          art: { type: "string", description: "その場面の挿絵の内容（英語・1〜2文）" },
          withMom: { type: "boolean" },
          withDad: { type: "boolean" },
          companions: COMPANIONS,
        },
      },
    },
  },
} as const;

export type StoryInput = { synopsis: string; childName: string; childAge: number; level: LevelId; cast: CastInput[] };

type AiScene = { text: string; art: string; withMom: boolean; withDad: boolean; companions?: number[] };
type AiBody = { title: string; cover: string; coverCompanions?: number[]; companions?: { look: string }[]; scenes: AiScene[] };

/** 仲間の番号（1から）を、登場人物の番号（0から）にする */
function toGuests(v: unknown, count: number) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= count).map((n) => n - 1))].sort((a, b) => a - b);
}

/** お客様が入れた、ほかの登場人物（名前・種類・どんな人か）を整える。おかしければ null */
export function cleanCastInput(v: unknown): CastInput[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_CAST) return null;
  const out: CastInput[] = [];
  for (const c of v) {
    const name = typeof c?.name === "string" ? c.name.replace(/\s+/g, " ").trim() : "";
    const about = typeof c?.about === "string" ? c.about.replace(/\s+/g, " ").trim() : "";
    if (!name || [...name].length > CAST_NAME_MAX || [...about].length > CAST_ABOUT_MAX) return null;
    if (c.kind !== "person" && c.kind !== "animal") return null;
    out.push({ name, kind: c.kind, about });
  }
  return out;
}

/** あらすじから、題名と12場面を作る。AIが使えないデモモードでは仮のお話を返す */
export async function generateCustomStory(input: StoryInput): Promise<CustomStory> {
  const ai = getOpenAI();
  const body = ai ? await askAi(input) : demoStory(input);
  const title = [...body.title.trim()].slice(0, CUSTOM_TITLE_MAX).join("");
  const n = input.cast.length;
  const scenes: CustomScene[] = body.scenes.slice(0, CUSTOM_SCENES).map((s) => ({
    text: [...s.text.trim()].slice(0, CUSTOM_TEXT_MAX).join(""),
    art: s.art.trim().slice(0, 600),
    withMom: !!s.withMom,
    withDad: !!s.withDad,
    guests: toGuests(s.companions, n),
  }));
  if (scenes.length !== CUSTOM_SCENES) throw new Error("お話を作れませんでした。もう一度お試しください");
  // 見た目の説明が足りないときは、種類だけで描く
  const cast: CastMember[] = input.cast.map((c, i) => ({
    ...c,
    look: (body.companions?.[i]?.look ?? "").trim().slice(0, 300) || (c.kind === "animal" ? "a friendly animal" : "a friendly person"),
  }));
  const story = { title, level: input.level, cover: body.cover.trim().slice(0, 600), scenes, cast, coverGuests: toGuests(body.coverCompanions, n) };
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
    ...castRules(input.cast),
  ].join("\n");
  let lastError: unknown = null;
  for (const model of TEXT_MODELS()) {
    try {
      const res = await ai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `あらすじ：${input.synopsis}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "picture_book", strict: true, schema: SCHEMA } },
      });
      const raw = res.choices[0]?.message?.content;
      if (!raw) throw new Error(`empty response (${res.choices[0]?.finish_reason ?? "no choice"})`);
      const body = JSON.parse(raw) as AiBody;
      if (!Array.isArray(body.scenes) || body.scenes.length < CUSTOM_SCENES) throw new Error(`scenes: ${body.scenes?.length}`);
      return body;
    } catch (e) {
      // モデルが無い・使えないとき（404・400）は次の候補へ。それ以外（内容の不足など）も一度だけ次で試す
      console.error(`custom story with ${model} failed`, e);
      lastError = e;
    }
  }
  throw lastError ?? new Error("no model");
}

/** ほかの登場人物（仲間）についての指示 */
function castRules(cast: CastInput[]) {
  if (!cast.length) return ["主人公・ママ・パパ以外の、名前のある登場人物は作らない（動物や生き物の名前のない脇役はよい）。"];
  return [
    "主人公といっしょに、次の仲間が登場する（お客様の家族やペットなど。写真をもとに描く）。本文では名前をそのまま使い、お話の中で自然に活躍させる。あらすじに出てこない仲間も、少なくとも1場面には登場させる。",
    ...cast.map((c, i) => `- Companion ${i + 1}：「${c.name}」（${CAST_KIND_LABEL[c.kind]}${c.about ? `・${c.about}` : ""}）`),
    "挿絵の内容（art・cover）では、仲間は名前ではなく必ず \"Companion 1\" のように番号で書く。その絵に出る仲間の番号を companions / coverCompanions に入れる。",
    "companions（見た目の説明）は仲間の順に、英語1文で、人なら年代・性別・体つき、動物なら種類・大きさ・毛の色などを書く。お客様の説明にあることだけを使い、分からないことは書かない。服装は書かない。",
    "この仲間のほかに、名前のある登場人物は作らない（動物や生き物の名前のない脇役はよい）。",
  ];
}

function demoStory(input: StoryInput): AiBody {
  const n = input.cast.length;
  return {
    title: "わたしの おはなし",
    cover: `the child smiling in a bright, friendly fantasy landscape${n ? " with Companion 1" : ""}`,
    coverCompanions: n ? [1] : [],
    companions: input.cast.map((c) => ({ look: c.kind === "animal" ? "a small friendly animal" : "a kind grown-up" })),
    scenes: Array.from({ length: CUSTOM_SCENES }, (_, i) => {
      const guests = n ? [(i % n) + 1] : [];
      return {
        text: `［デモ］${input.childName}の おはなし ${i + 1}ページめ。${guests.length ? `${input.cast[guests[0] - 1].name}も いっしょ。` : ""}${input.synopsis.slice(0, 30)}`,
        art: `the child${guests.length ? ` and Companion ${guests[0]}` : ""} in scene ${i + 1} of a gentle adventure`,
        withMom: false,
        withDad: false,
        companions: guests,
      };
    }),
  };
}

/** 本文と題名に、絵本にふさわしくない言葉がないか（OpenAI のモデレーション）。AIが使えないときは確かめない */
export async function storyTextFlagged(s: Pick<CustomStory, "title" | "scenes" | "cast">) {
  const ai = getOpenAI();
  if (!ai) return false;
  const input = [s.title, ...s.cast.map((c) => `${c.name} ${c.about}`), ...s.scenes.map((x) => x.text)].join("\n");
  const res = await ai.moderations.create({ model: "omni-moderation-latest", input });
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
