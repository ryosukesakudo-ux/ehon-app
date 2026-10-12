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

export function signStory(s: Pick<CustomStory, "cover" | "scenes" | "level" | "cast" | "coverGuests" | "facts">) {
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

// 構図の候補（毎ページ正面向きの似た絵にならないよう、AIにこの中から場面に合うものを選ばせる。2026-10-12 作道さん「構図がどれも同じ」）
const CAMERAS = [
  "wide establishing shot from far away, the characters small in a big landscape",
  "seen from behind the child, looking at what the child sees",
  "over-the-shoulder view from behind one character toward another",
  "low angle looking up at the child",
  "high angle looking down from above",
  "side view in motion, characters running or walking across the frame",
  "close-up on the child's face and hands showing the feeling",
  "medium shot of two characters facing each other",
  "view through a doorway or window into the room",
  "bird's-eye view from high above",
];

const COMPANIONS = { type: "array", items: { type: "integer" }, description: "この絵に出る仲間（Companion）の番号。いなければ空" } as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "facts", "cover", "coverCompanions", "companions", "scenes"],
  properties: {
    facts: {
      type: "string",
      description:
        "お話全体の決まりごと（英語・3〜8文）。どこに住んでいて誰の家に行くか、誰が誰を出迎えるか、亡くなっている人や動物（実際にはそこにいない）、季節、屋内では靴をぬぐ、などの絵がずれないための事実",
    },
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
        required: ["text", "setting", "art", "camera", "withMom", "withDad", "companions"],
        properties: {
          text: { type: "string", description: "その場面の本文（日本語）" },
          setting: { type: "string", description: "場所（誰の家・どの部屋か）、屋内か屋外か、時間帯・天気（英語・1文）" },
          art: { type: "string", description: "その場面の挿絵の内容（英語・2〜3文）。誰がどこで何をしていて、どんな表情か" },
          camera: { type: "string", description: "カメラの位置・構図（英語・1文）" },
          withMom: { type: "boolean" },
          withDad: { type: "boolean" },
          companions: COMPANIONS,
        },
      },
    },
  },
} as const;

/** お話を作る前のAIの質問と、お客様の答え */
export type StoryAnswer = { q: string; a: string };
export const QUESTION_MAX = 3;
export const ANSWER_MAX = 100;

export type StoryInput = { synopsis: string; childName: string; childAge: number; level: LevelId; cast: CastInput[]; answers?: StoryAnswer[] };

type AiScene = { text: string; setting?: string; art: string; camera?: string; withMom: boolean; withDad: boolean; companions?: number[] };
type AiBody = { title: string; facts?: string; cover: string; coverCompanions?: number[]; companions?: { look: string }[]; scenes: AiScene[] };

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
    setting: (s.setting ?? "").trim().slice(0, 300),
    camera: (s.camera ?? "").trim().slice(0, 300),
  }));
  if (scenes.length !== CUSTOM_SCENES) throw new Error("お話を作れませんでした。もう一度お試しください");
  // 見た目の説明が足りないときは、種類だけで描く
  const cast: CastMember[] = input.cast.map((c, i) => ({
    ...c,
    look: (body.companions?.[i]?.look ?? "").trim().slice(0, 300) || (c.kind === "animal" ? "a friendly animal" : "a friendly person"),
  }));
  const story = {
    title,
    level: input.level,
    cover: body.cover.trim().slice(0, 600),
    scenes,
    cast,
    coverGuests: toGuests(body.coverCompanions, n),
    facts: (body.facts ?? "").trim().slice(0, 1200),
  };
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
    "ママ（the mother）とパパ（the father）は、あらすじに出てくるときだけ登場させてよい。",
    "【絵の指示の作り方】絵は1ページずつ別々に描くので、絵を描く人は本文を読めない。だから文脈は facts・setting・art にすべて書く。",
    "- まず facts に、お話全体の事実を英語でまとめる：家族がどこに住んでいるか、どこへ出かけるか（例：the child visits the grandfather's house; the grandfather welcomes the child at his front door）、亡くなっている人や動物（例：the dog Companion 1 passed away before this story; it appears only as a memory, a photo, a dream or a soft glowing spirit, never as if alive in the room）、季節、日本の家では屋内で靴をぬいでいること。",
    "- 各場面の setting に、場所（誰の家のどの部屋か・どこの外か）、屋内か屋外か、時間帯を書く。屋内では \"everyone is barefoot or in socks, no shoes\" と書く。",
    "- art には、その場面で誰がどこで何をしているかを、立場（迎える人・訪ねる人など）が分かるように書く。本文と食い違わないこと。",
    "- 【登場する人を絞る】withMom / withDad / companions は、その場面の本文に名前が出て、実際にその場にいる人だけ true・番号を入れる。全員を全ページに出さない。主人公ひとりや、主人公と1〜2人の場面を多くする。亡くなっている人や動物は、思い出・写真・夢として出す場面以外は入れない。",
    `- 【構図を変える】camera は場面ごとに変え、同じ構図を続けない。12場面のうち、後ろ姿・遠景・見上げ・見下ろし・寄りをそれぞれ1回以上使う。候補：${CAMERAS.join(" / ")}`,
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
          { role: "user", content: userMessage(input) },
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

/** あらすじと、作る前の質問への答え */
function userMessage(input: Pick<StoryInput, "synopsis" | "answers">) {
  const qa = (input.answers ?? []).filter((x) => x.a.trim());
  return [`あらすじ：${input.synopsis}`, ...(qa.length ? ["", "お客様への確認と答え：", ...qa.map((x) => `- ${x.q} → ${x.a}`)] : [])].join("\n");
}

const QUESTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: { questions: { type: "array", items: { type: "string" }, description: `確認したいこと（0〜${QUESTION_MAX}問）` } },
} as const;

/**
 * お話を作る前に、絵がずれないように確かめたいことをAIが質問する（2026-10-12 作道さん）。
 * 例：「おじいちゃんの家にはどうやって行きますか？」「コロはもう亡くなっていますか？」。はっきりしていれば質問なし。
 */
export async function askStoryQuestions(input: Omit<StoryInput, "level" | "answers">): Promise<string[]> {
  const ai = getOpenAI();
  if (!ai) return demoQuestions(input);
  const system = [
    "あなたは日本の幼児向け絵本作家です。お客様のあらすじから12場面の絵本を作る前に、挿絵が食い違わないよう、お客様に確認したいことを日本語で質問します。",
    `質問は${QUESTION_MAX}問まで。あらすじから分かることや、お話の楽しさに関係ない細かいことは聞かない。はっきりしていれば質問は0問でよい。`,
    "聞くとよいこと：場所（誰の家か・どこへ行くか）、登場人物の関係や立場（誰が迎えるか）、亡くなっている人や動物が実際に登場するのか思い出として出るのか、季節、お話の結末の希望 など。",
    "1問は40文字くらいまでの、やさしい話し言葉で。子どもの名前やほかの登場人物の名前を使ってよい。",
    `主人公は「${input.childName}」（${input.childAge}さい）。`,
    ...(input.cast.length ? [`ほかの登場人物：${input.cast.map((c) => `${c.name}（${CAST_KIND_LABEL[c.kind]}${c.about ? `・${c.about}` : ""}）`).join("、")}`] : []),
  ].join("\n");
  for (const model of TEXT_MODELS()) {
    try {
      const res = await ai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `あらすじ：${input.synopsis}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "story_questions", strict: true, schema: QUESTIONS_SCHEMA } },
      });
      const raw = res.choices[0]?.message?.content;
      if (!raw) throw new Error("empty response");
      const body = JSON.parse(raw) as { questions?: unknown };
      return (Array.isArray(body.questions) ? body.questions : [])
        .filter((q): q is string => typeof q === "string" && !!q.trim())
        .map((q) => [...q.trim()].slice(0, 80).join(""))
        .slice(0, QUESTION_MAX);
    } catch (e) {
      console.error(`story questions with ${model} failed`, e);
    }
  }
  // 質問が作れなくても、お話づくりは止めない
  return [];
}

function demoQuestions(input: Omit<StoryInput, "level" | "answers">) {
  return [
    `［デモ］お話の舞台はどこですか？（例：${input.childName}のおうち、おじいちゃんの家）`,
    ...(input.cast.length ? [`［デモ］${input.cast[0].name}は、お話の中で実際にいっしょにいますか？`] : []),
  ];
}

/** 質問と答えを整える（質問も答えも長さを決める）。おかしければ null */
export function cleanAnswers(v: unknown): StoryAnswer[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > QUESTION_MAX) return null;
  const out: StoryAnswer[] = [];
  for (const x of v) {
    const q = typeof x?.q === "string" ? x.q.trim() : "";
    const a = typeof x?.a === "string" ? x.a.replace(/\s+/g, " ").trim() : "";
    if (!q || [...q].length > 80 || [...a].length > ANSWER_MAX) return null;
    out.push({ q, a });
  }
  return out;
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
    facts: "Demo story. Indoors everyone is barefoot.",
    cover: `the child smiling in a bright, friendly fantasy landscape${n ? " with Companion 1" : ""}`,
    coverCompanions: n ? [1] : [],
    companions: input.cast.map((c) => ({ look: c.kind === "animal" ? "a small friendly animal" : "a kind grown-up" })),
    scenes: Array.from({ length: CUSTOM_SCENES }, (_, i) => {
      const guests = n ? [(i % n) + 1] : [];
      return {
        text: `［デモ］${input.childName}の おはなし ${i + 1}ページめ。${guests.length ? `${input.cast[guests[0] - 1].name}も いっしょ。` : ""}${input.synopsis.slice(0, 30)}`,
        setting: i % 2 ? "outdoors in a sunny park, daytime" : "inside the family's living room, daytime, everyone barefoot",
        art: `the child${guests.length ? ` and Companion ${guests[0]}` : ""} in scene ${i + 1} of a gentle adventure`,
        camera: CAMERAS[i % CAMERAS.length],
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
