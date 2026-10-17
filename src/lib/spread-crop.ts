import "server-only";
import sharp from "sharp";
import { getOpenAI } from "./services";

// 見開きの絵は AI が横長（3:2）で描き、本（2:1）にするとき上下を切る。真ん中で切ると、肩車など頭が上のほうにある絵で
// 頭が切れた（2026-10-17 作道さん：森1話 場面11）。描いた直後にAIに頭のいちばん上の位置を見てもらい、頭が残る位置で 2:1 に切って保存する。
// 保存した絵が 2:1 なので、プレビュー・文の置き場所・印刷はどれもそのまま使える（切らない）。

const MODELS = () => [...new Set([process.env.OPENAI_TEXT_MODEL, "gpt-5-mini", "gpt-4.1-mini"].filter((m): m is string => !!m))];

/** 頭の上に残す余白（元の絵の高さに対する割合）。しまうまで四方が約3.5%隠れる分も見込む */
const HEAD_ROOM = 0.06;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headTop"],
  properties: { headTop: { type: ["number", "null"] } },
} as const;

/** 人物・動物の頭（髪・耳・帽子を含む）のいちばん上が、絵の上端から何割の所か（0〜1）。人も動物もいない・分からなければ null */
async function findHeadTop(png: Buffer): Promise<number | null> {
  const ai = getOpenAI();
  if (!ai) return null;
  const jpg = await sharp(png).resize(768, 512, { fit: "fill" }).jpeg({ quality: 80 }).toBuffer();
  const prompt = [
    "Look at every person and every animal in this picture.",
    "Find the highest point of any of their heads, including hair, ears, hats and a child riding on someone's shoulders or being held up.",
    "Answer headTop: how far that highest point is from the top edge of the picture, as a fraction of the picture height (0 = at the top edge, 1 = at the bottom edge).",
    "If there is no person or animal, answer null.",
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
        response_format: { type: "json_schema", json_schema: { name: "head_top", strict: true, schema: SCHEMA } },
      });
      const headTop = JSON.parse(res.choices[0]?.message?.content ?? "{}").headTop;
      if (headTop === null) return null;
      if (typeof headTop === "number" && headTop >= 0 && headTop <= 1) return headTop;
      throw new Error(`headTop: ${headTop}`);
    } catch (e) {
      console.error(`spread head top with ${model} failed`, e);
    }
  }
  return null;
}

/**
 * 横長（3:2）の見開きの絵を、本と同じ 2:1 に切る。いつもは上下を同じだけ切り、頭が上の切る範囲に入るときは
 * 頭の上に余白が残る所まで切る位置を下げる（その分、下を多く切る）。すでに 2:1 より横長なら、そのまま返す
 */
export async function cropSpreadToBook(b64: string): Promise<string> {
  const png = Buffer.from(b64, "base64");
  const { width = 0, height = 0 } = await sharp(png).metadata();
  const visible = Math.round(width / 2);
  if (!width || !height || visible >= height) return b64;
  const band = height - visible;
  const headTop = await findHeadTop(png);
  const center = Math.round(band / 2);
  const top = headTop === null ? center : Math.max(0, Math.min(center, Math.round((headTop - HEAD_ROOM) * height)));
  const out = await sharp(png).extract({ left: 0, top, width, height: visible }).png().toBuffer();
  return out.toString("base64");
}
