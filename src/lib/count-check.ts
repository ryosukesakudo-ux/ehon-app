import "server-only";
import sharp from "sharp";
import { getOpenAI } from "./services";

// 数のお勉強シリーズの「数が大事な場面」を、決めた数どおりに描くための仕組み。
// 画像AIは数を数えながら描くのが苦手で、指示を言い直しても数がぶれる（2026-10-21 作道さん：2話 場面10の「10こ1束の風船」が7こや14こになる）。
// そこで (1) 数えやすい並べ方の決まりを絵の指示に足し、(2) 描いたあと画像を見るAIに数えてもらい、違えば描き直す（回数と時間に上限あり）。
// 上限まで合わなければ、いちばん近い絵を残して、合わなかったことを知らせる。

/** 場面で数を守りたい物。what：AIへの説明（英語）、label：画面に出す名前、each：グループごとの数（例：たば1つずつの風船の数）を確かめる */
export type CountRule = { what: string; label: string; n: number; each?: boolean };

const MODELS = () => [...new Set([process.env.OPENAI_TEXT_MODEL, "gpt-5-mini", "gpt-4.1-mini"].filter((m): m is string => !!m))];

/** 描き直すのは最大この回数まで（最初の1枚と合わせて3枚） */
const MAX_REDRAWS = 2;
/** 描き始めてからこの時間を過ぎたら描き直さない（関数の上限300秒に収める。1枚およそ1分） */
const REDRAW_BEFORE_MS = 150_000;

/** 絵の指示に足す、数えやすく描くための決まり */
export function countPrompt(counts: CountRule[] | undefined) {
  if (!counts?.length) return "";
  const list = counts.map((c) => `${c.what}${c.each ? " (in each group)" : ""}: exactly ${c.n}`).join("; ");
  return (
    `Counting is the lesson of this page, so the numbers must be exact and easy to count with a finger: ${list}. ` +
    "Draw every counted thing whole and clearly separate, never overlapping or hidden behind anything, never cut off by the edge of the picture, large enough to count one by one, with no extra ones anywhere in the background."
  );
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["counts"],
        properties: { counts: { type: "array", items: { type: "integer" } } },
      },
    },
  },
} as const;

/** 画像を見るAIに数えてもらう。各決まりごとに、数（each なら各グループの数）の配列。数えられなかったら null */
async function countInImage(b64: string, counts: CountRule[]): Promise<number[][] | null> {
  const ai = getOpenAI();
  if (!ai) return null;
  const jpg = await sharp(Buffer.from(b64, "base64")).resize(1536, 1536, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
  const prompt = [
    "You check a children's counting picture book. Count carefully, one by one, what is visible in this picture.",
    ...counts.map((c, i) =>
      c.each
        ? `Item ${i + 1}: for every group, count the ${c.what}. Answer one number per group, in any order.`
        : `Item ${i + 1}: count the ${c.what}. Answer a single number.`,
    ),
    `Answer items in the same order (${counts.length} items). Count only what is really drawn; partly hidden ones count too.`,
  ].join("\n");
  for (const model of MODELS()) {
    try {
      const res = await ai.chat.completions.create({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpg.toString("base64")}`, detail: "high" } },
            ],
          },
        ],
        response_format: { type: "json_schema", json_schema: { name: "count_check", strict: true, schema: SCHEMA } },
        ...(model.startsWith("gpt-5") && { reasoning_effort: "medium" as const }),
      });
      const items = (JSON.parse(res.choices[0]?.message?.content ?? "{}") as { items?: { counts: number[] }[] }).items;
      if (!items || items.length !== counts.length || items.some((x) => !x.counts.length)) throw new Error(`items: ${JSON.stringify(items)}`);
      return items.map((x) => x.counts);
    } catch (e) {
      console.error(`count check with ${model} failed`, e);
    }
  }
  return null;
}

/** 数のずれの合計（0なら合っている） */
function miss(counts: CountRule[], found: number[][]) {
  return counts.reduce((sum, c, i) => sum + (c.each ? found[i].reduce((s, x) => s + Math.abs(x - c.n), 0) : Math.abs(found[i][0] - c.n)), 0);
}

function describe(counts: CountRule[], found: number[][]) {
  return counts.map((c, i) => `${c.label} ${c.n}こ → ${found[i].join("・")}`).join(" / ");
}

export type CountedImage = { b64: string; warning?: string };

/**
 * draw で絵を描き、counts があれば数を確かめる。違えば描き直し、上限まで合わなければいちばん近い絵と warning を返す。
 * 数えるAIが使えないときは確かめずにそのまま返す
 */
export async function drawCounted(counts: CountRule[] | undefined, draw: () => Promise<string>): Promise<CountedImage> {
  const started = Date.now();
  let b64 = await draw();
  if (!counts?.length) return { b64 };
  let best: { b64: string; miss: number; found: number[][] } | null = null;
  for (let attempt = 0; ; attempt++) {
    const found = await countInImage(b64, counts);
    if (!found) return best ? { b64: best.b64, warning: `数を確かめられませんでした（${describe(counts, best.found)}）` } : { b64 };
    const m = miss(counts, found);
    if (m === 0) return { b64 };
    if (!best || m < best.miss) best = { b64, miss: m, found };
    console.warn(`count mismatch (attempt ${attempt + 1}): ${describe(counts, found)}`);
    if (attempt >= MAX_REDRAWS || Date.now() - started > REDRAW_BEFORE_MS) break;
    b64 = await draw();
  }
  return { b64: best.b64, warning: `数が合いませんでした。いちばん近い絵を残しています（${describe(counts, best.found)}）。もう一度作り直してください` };
}
