import "server-only";
import sharp from "sharp";
import { SPREAD_TEXT_SPOTS, type SpreadTextSpot } from "./series";

// お客様の本の見開きの絵（2026-10-15 作道さん：本文の場面を見開き版に切り替え）。
// 絵は横長（3:2）で描き、文を置く場所（AIが選んだ、人物・動物のいない所）は絵の隣に JSON（xxx/preview/03-text.json）で保存する。
// 切り替える前に作った正方形の絵も残っているので、絵の形を見て、正方形なら今までどおり「左に文・右に絵」で組む。

/**
 * お客様の本の本文の場面（0〜11）で、文を置くページ（絵を描くときに空けておくページ）。場面ごとに右・左を交互にして、構図に変化をつける。
 * 絵スタジオの見開き版の本（bookTextSide）と同じ並び
 */
export function sceneTextSide(sceneIndex: number): "left" | "right" {
  return sceneIndex % 2 === 0 ? "right" : "left";
}

/** 絵（PNG）の保存先に対応する、文の置き場所の JSON の保存先 */
export function sceneSpotPath(path: string) {
  return path.replace(/\.png$/, "-text.json");
}

/** 横長の絵（見開きの絵）か */
export async function isWideImage(img: Buffer) {
  const { width = 1, height = 1 } = await sharp(img).metadata();
  return width > height * 1.2;
}

/** JSON の中身から文の置き場所を読む。無い・選べなかった（none）ときは、文を置くよう頼んだページの下 */
export function parseSceneSpot(json: string | null, side: "left" | "right"): SpreadTextSpot {
  try {
    const spot = json ? (JSON.parse(json) as { spot?: string }).spot : null;
    if ((SPREAD_TEXT_SPOTS as readonly string[]).includes(spot ?? "")) return spot as SpreadTextSpot;
  } catch {
    // 読めなければ下の決まりで置く
  }
  return `${side}-bottom`;
}
