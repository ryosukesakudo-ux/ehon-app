import "server-only";
import sharp from "sharp";

/**
 * 1024px で作った絵を、印刷用の大きさに拡大する（画質くらべの「A方式」）。height を渡すと横長（見開きの絵）にも使える。
 * 外部サービスを使わず、なめらかに拡大してから輪郭を少しだけくっきりさせる。
 */
export async function upscalePng(b64: string, size = 2048, height = size): Promise<string> {
  const out = await sharp(Buffer.from(b64, "base64"))
    .resize(size, height, { kernel: "lanczos3" })
    .sharpen({ sigma: 0.8, m1: 0.6, m2: 1.2 })
    .png()
    .toBuffer();
  return out.toString("base64");
}

/** 画面で見比べる用に JPEG（高画質）にする。2048px の PNG は大きすぎて返せないため */
export async function toJpegB64(b64: string): Promise<string> {
  const out = await sharp(Buffer.from(b64, "base64")).flatten({ background: "#ffffff" }).jpeg({ quality: 95 }).toBuffer();
  return out.toString("base64");
}
