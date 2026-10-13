import "server-only";
import sharp from "sharp";
import { getOpenAI } from "./services";
import { SPREAD_TEXT_SPOTS, type SpreadTextSpot } from "./series";

// 見開きの試作：できた絵をAIに見せて、文を置いても人物・動物・大事な物に被らない場所を選んでもらう（2026-10-13 作道さん）。
// 見開きは 2:1 なので、横長（3:2）の絵の上下1/6を切った、本に載る範囲だけを見せる。

const MODELS = () => [...new Set([process.env.OPENAI_TEXT_MODEL, "gpt-5-mini", "gpt-4.1-mini"].filter((m): m is string => !!m))];

const SPOT_LABEL: Record<SpreadTextSpot, string> = {
  "left-top": "left page, upper part",
  "left-middle": "left page, middle",
  "left-bottom": "left page, lower part",
  "right-top": "right page, upper part",
  "right-middle": "right page, middle",
  "right-bottom": "right page, lower part",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["spot"],
  properties: { spot: { type: "string", enum: [...SPREAD_TEXT_SPOTS] } },
} as const;

/** 文を置く場所を選ぶ。side：絵を描くときに空けておくよう頼んだページ（そこが空いていれば下を優先） */
export async function findSpreadTextSpot(png: Buffer, side: "left" | "right"): Promise<SpreadTextSpot> {
  const fallback: SpreadTextSpot = `${side}-bottom`;
  const ai = getOpenAI();
  if (!ai) return fallback;
  const meta = await sharp(png).metadata();
  const w = meta.width ?? 1536;
  const h = meta.height ?? 1024;
  const visible = Math.min(h, Math.round(w / 2));
  const jpg = await sharp(png)
    .extract({ left: 0, top: Math.round((h - visible) / 2), width: w, height: visible })
    .resize(1024, 512)
    .jpeg({ quality: 80 })
    .toBuffer();
  const prompt = [
    "This image is a two-page spread of a square picture book. The vertical center line is the fold between the left page and the right page.",
    "A short text (a few lines) will be placed on a semi-transparent white box covering about 42% of the width of the whole spread and about one third of its height, inside one of these spots:",
    ...SPREAD_TEXT_SPOTS.map((s) => `- ${s}: ${SPOT_LABEL[s]}`),
    "Choose the spot where the box would cover no person, no animal, no face, no hand and no important object; only background such as sky, ground, grass, water, a wall or foliage.",
    `If several spots are free, prefer ${fallback}, then other spots on the ${side} page, then lower spots.`,
    "If no spot is completely free, choose the one that covers the least of the characters (never a face).",
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
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpg.toString("base64")}`, detail: "low" } },
            ],
          },
        ],
        response_format: { type: "json_schema", json_schema: { name: "spread_text_spot", strict: true, schema: SCHEMA } },
      });
      const spot = JSON.parse(res.choices[0]?.message?.content ?? "{}").spot;
      if ((SPREAD_TEXT_SPOTS as readonly string[]).includes(spot)) return spot as SpreadTextSpot;
      throw new Error(`spot: ${spot}`);
    } catch (e) {
      console.error(`spread text spot with ${model} failed`, e);
    }
  }
  // 選べなくても絵は保存する（空けるよう頼んだ側の下に置く）
  return fallback;
}
