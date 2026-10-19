import "server-only";
import type { VeoQuality } from "./studio";

// Google の動画AI Veo 3.1（Gemini API）で、1枚の絵を最初のコマ（＋任意で最後のコマ）にして8秒の動画を作る。
// キーは GEMINI_API_KEY（Google AI Studio で発行）。未設定なら使えない。
// 作成には11秒〜6分かかるので、「開始」と「できたか確認」を分けている（Vercel の関数の制限時間内に収めるため）。
// 参照: https://ai.google.dev/gemini-api/docs/veo

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export function veoReady() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function headers() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY が未設定です（Google AI Studio で発行して Vercel に設定してください）");
  return { "x-goog-api-key": key, "Content-Type": "application/json" };
}

function model(quality: VeoQuality) {
  return quality === "fast"
    ? (process.env.VEO_FAST_MODEL ?? "veo-3.1-fast-generate-preview")
    : (process.env.VEO_MODEL ?? "veo-3.1-generate-preview");
}

/** 動画の作成を始める。返る operation 名で veoPoll に進捗を聞く */
export async function veoStart(opts: {
  prompt: string;
  imagePng: Buffer;
  /** 最後のコマ。あると最初と最後が絵で固定され、間を Veo がつなぐ */
  lastFramePng?: Buffer;
  quality: VeoQuality;
  /** 見た目を揃えるための参考画像（設定画など、最大3枚）。Veo 3.1 の referenceImages（referenceType: asset） */
  referenceImages?: Buffer[];
  /** 出してほしくないもの */
  negativePrompt?: string;
}) {
  const refs = (opts.referenceImages ?? []).slice(0, 3);
  const request = (withRefs: boolean) =>
    fetch(`${BASE}/models/${model(opts.quality)}:predictLongRunning`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        instances: [
          {
            prompt: opts.prompt,
            // Gemini API の predictLongRunning は inlineData ではなく bytesBase64Encoded（公式SDK imageToMldev と同じ形）
            image: toImage(opts.imagePng),
            ...(opts.lastFramePng ? { lastFrame: toImage(opts.lastFramePng) } : {}),
            ...(withRefs && refs.length
              ? { referenceImages: refs.map((png) => ({ image: toImage(png), referenceType: "asset" })) }
              : {}),
          },
        ],
        parameters: {
          aspectRatio: "9:16",
          resolution: "720p",
          // 数値で渡す（文字列だと "needs to be a number" になる）。絵から動かすときは 8 のみ
          durationSeconds: 8,
          // 絵から動かすときは allow_adult しか選べない（子どもの顔は出さない前提）
          personGeneration: "allow_adult",
          ...(opts.negativePrompt ? { negativePrompt: opts.negativePrompt } : {}),
        },
      }),
    });

  let usedReferenceImages = refs.length > 0;
  let res = await request(true);
  let json = await res.json().catch(() => ({}));
  // 最初のコマ＋参考画像の組み合わせが断られたら、参考画像なしでもう一度（公式ドキュメントに組み合わせ可否の記載がないため）
  if (!res.ok && refs.length && res.status === 400) {
    console.warn("Veo refused referenceImages with first frame, retrying without:", json?.error?.message);
    usedReferenceImages = false;
    res = await request(false);
    json = await res.json().catch(() => ({}));
  }
  if (!res.ok) throw new Error(json?.error?.message ?? `Veo の開始に失敗しました (${res.status})`);
  const name: string | undefined = json?.name;
  if (!name) throw new Error("Veo から operation 名が返りませんでした");
  return { name, usedReferenceImages };
}

/**
 * 作った動画の続きを7秒延長する（Veo 3.1 の extension）。元の動画＋続きが1本になって返る。
 * 元は Veo が作った動画（720p）に限る。参照: https://ai.google.dev/gemini-api/docs/veo
 */
export async function veoExtend(opts: { prompt: string; videoMp4: Buffer; quality: VeoQuality; negativePrompt?: string }) {
  const res = await fetch(`${BASE}/models/${model(opts.quality)}:predictLongRunning`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      instances: [
        {
          prompt: opts.prompt,
          // 公式SDK videoToMldev と同じ形（encodedVideo / encoding）
          video: { encodedVideo: opts.videoMp4.toString("base64"), encoding: "video/mp4" },
        },
      ],
      parameters: {
        resolution: "720p",
        durationSeconds: 8,
        personGeneration: "allow_adult",
        ...(opts.negativePrompt ? { negativePrompt: opts.negativePrompt } : {}),
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Veo の延長に失敗しました (${res.status})`);
  const name: string | undefined = json?.name;
  if (!name) throw new Error("Veo から operation 名が返りませんでした");
  return name;
}

function toImage(png: Buffer) {
  return { bytesBase64Encoded: png.toString("base64"), mimeType: "image/png" };
}

/** できたか確認する。できていれば動画（mp4）を取ってくる */
export async function veoPoll(operation: string): Promise<{ done: false } | { done: true; mp4: Buffer }> {
  // operation 名は "models/.../operations/..." の形。英数字と / . - _ 以外は受け付けない
  if (!/^[\w./-]+$/.test(operation)) throw new Error("operation 名が不正です");
  const res = await fetch(`${BASE}/${operation}`, { headers: headers() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Veo の確認に失敗しました (${res.status})`);
  if (!json?.done) return { done: false };
  if (json.error) throw new Error(json.error.message ?? "Veo が動画を作れませんでした");
  const uri: string | undefined = json?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) {
    const reason = json?.response?.generateVideoResponse?.raiMediaFilteredReasons?.[0];
    throw new Error(reason ? `Veo が動画を作りませんでした: ${reason}` : "Veo から動画が返りませんでした");
  }
  const file = await fetch(uri, { headers: { "x-goog-api-key": headers()["x-goog-api-key"] }, redirect: "follow" });
  if (!file.ok) throw new Error(`動画のダウンロードに失敗しました (${file.status})`);
  return { done: true, mp4: Buffer.from(await file.arrayBuffer()) };
}
