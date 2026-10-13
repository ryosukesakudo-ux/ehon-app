import "server-only";
import sharp from "sharp";
import { getOpenAI } from "./services";
import { SPREAD_TEXT_SPOTS, type SpreadTextSpot } from "./series";

// 見開きの試作：できた絵をAIに見せて、文を置いても人物・動物・大事な物に被らない場所を選んでもらう（2026-10-13 作道さん）。
// 優先順位（2026-10-13 作道さん）：人物・動物に被せるのは絶対NG（被らない場所が無ければ "none"）→ 次に空など情報量の少ない背景。
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
  properties: { spot: { type: "string", enum: [...SPREAD_TEXT_SPOTS, "none"] } },
} as const;

/** 文を置く場所を選ぶ。side：絵を描くときに空けておくよう頼んだページ（条件が同じならこちらを優先）。被らない場所が無ければ "none" */
export async function findSpreadTextSpot(png: Buffer, side: "left" | "right"): Promise<SpreadTextSpot | "none"> {
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
    "A text of up to about ten lines will be placed on a semi-transparent white box covering about 45% of the width of the whole spread (almost one whole page) and up to about 60% of its height, inside one of these spots:",
    ...SPREAD_TEXT_SPOTS.map((s) => `- ${s}: ${SPOT_LABEL[s]}`),
    "Rule 1 (absolute, never break it): the box must not cover any part of any person or animal, not even a little: no face, hair, hand, foot, body, tail or wing, including small animals, birds and insects. A spot that would touch any of them is forbidden.",
    "Rule 2: among the allowed spots, choose the one whose background has the least visual information: plain open sky is best, then calm water, plain ground or grass, or a plain wall. Avoid busy areas with many details, flowers, objects or important props.",
    `Rule 3 (only to break a tie): prefer the ${side} page, then lower spots.`,
    'If every spot breaks rule 1, answer "none".',
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
        response_format: { type: "json_schema", json_schema: { name: "spread_text_spot", strict: true, schema: SCHEMA } },
      });
      const spot = JSON.parse(res.choices[0]?.message?.content ?? "{}").spot;
      if (spot === "none" || (SPREAD_TEXT_SPOTS as readonly string[]).includes(spot)) return spot as SpreadTextSpot | "none";
      throw new Error(`spot: ${spot}`);
    } catch (e) {
      console.error(`spread text spot with ${model} failed`, e);
    }
  }
  // 選べなくても絵は保存する（空けるよう頼んだ側の下に置く）
  return fallback;
}

// 文字の後ろの明るさ（0〜255）がこれより暗いと、黒い字が読みにくいので薄い白を敷く（2026-10-13 作道さん：白い背景は基本なし）
const DARK_BELOW = 115;

/** 選んだ場所（文の枠のあたり）の絵が暗いか。見え方（studio.tsx の SpreadPreview）と同じ枠：横は片ページの端から3%〜47%、縦は上7%〜67%／真ん中20%〜80%／下33%〜93% */
export async function isSpotDark(png: Buffer, spot: SpreadTextSpot): Promise<boolean> {
  const meta = await sharp(png).metadata();
  const w = meta.width ?? 1536;
  const h = meta.height ?? 1024;
  const visible = Math.min(h, Math.round(w / 2));
  const top0 = Math.round((h - visible) / 2);
  const [side, vert] = spot.split("-") as ["left" | "right", "top" | "middle" | "bottom"];
  const x0 = side === "left" ? 0.03 : 0.53;
  const y0 = vert === "top" ? 0.07 : vert === "middle" ? 0.2 : 0.33;
  const { channels } = await sharp(png)
    .extract({ left: Math.round(w * x0), top: top0 + Math.round(visible * y0), width: Math.round(w * 0.44), height: Math.round(visible * 0.6) })
    .greyscale()
    .stats();
  return channels[0].mean < DARK_BELOW;
}
