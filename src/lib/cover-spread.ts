import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";

// 製本直送.com「表紙作成コース」用の見開き表紙画像（JPEG・CMYK・300dpi）。
// 左綴じなので、左から 裏表紙 / 背 / おもて表紙 の順に並べる。四方に塗り足し3mm。
// - おもて：入稿用PDFの表紙と同じ（上1/3にタイトルの帯、下2/3に表紙の絵）。
// - 背：無地（28ページだと約2mmしかなく、文字は入らない）。
// - 裏：無地にサービス名だけ小さく入れる。
// 文字はフォントの輪郭をSVGのパスにして描く（サーバーに日本語フォントが無くても描けるように）。

const DPI = 300;
const BLEED_MM = 3;
const SAFE_MM = 12;
const px = (mmValue: number) => Math.round((mmValue / 25.4) * DPI);

const CREAM = "#fff8ec";
const NAVY = "#1e2f57";
const CORAL = "#f08a6c";

const FONT_DIR = path.join(process.cwd(), "assets/fonts");

export type CoverSpreadInput = {
  storyName: string;
  childName: string;
  coverImage: Buffer; // 表紙の絵（横長 3:2）
  trimMm: number; // 仕上がりの1辺
  spineMm: number; // 背幅
};

export async function buildCoverSpread(input: CoverSpreadInput) {
  const font = fontkit.create(await readFile(path.join(FONT_DIR, "MPLUSRounded1c-ExtraBold.ttf")));
  const { trimMm, spineMm } = input;
  const scale = trimMm / 210; // 21cm角を基準に文字の大きさをそろえる（入稿用PDFと同じ）
  const pt = (v: number) => (v * DPI) / 72; // PDFと同じポイント数を px にする

  const width = px(BLEED_MM * 2 + trimMm * 2 + spineMm);
  const height = px(BLEED_MM * 2 + trimMm);
  // おもて表紙：背の右端から、右の塗り足しまで
  const frontLeft = px(BLEED_MM + trimMm + spineMm);
  const frontWidth = width - frontLeft;
  const frontCenter = frontLeft + px(trimMm / 2);
  const backCenter = px(BLEED_MM + trimMm / 2);

  // 下2/3に表紙の絵（おもて表紙の幅いっぱい）
  const artHeight = Math.round((height * 2) / 3);
  const art = await sharp(input.coverImage)
    .flatten({ background: "#ffffff" })
    .resize(frontWidth, artHeight, { fit: "cover" })
    .toBuffer();

  // 上1/3の帯にタイトル（入稿用PDFの表紙と同じ大きさ・位置）
  const title = `${input.childName}の`;
  const leadSize = pt(20 * scale);
  const titleSize = fitSize(font, input.storyName, pt(34 * scale), px(trimMm - SAFE_MM * 2));
  const blockHeight = leadSize + titleSize * 1.4;
  const bandTop = px(BLEED_MM);
  const bandBottom = height - artHeight;
  const blockTop = (bandTop + bandBottom) / 2 - blockHeight / 2;
  const texts = [
    textPath(font, title, leadSize, frontCenter, blockTop + leadSize, CORAL),
    textPath(font, input.storyName, titleSize, frontCenter, blockTop + leadSize + titleSize * 1.4, NAVY),
    // 裏表紙：下の方にサービス名
    textPath(font, "絵本 Only Yours", pt(10 * scale), backCenter, height - px(BLEED_MM + SAFE_MM), CORAL),
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${texts.join("")}</svg>`;

  const rgbImage = await sharp({ create: { width, height, channels: 3, background: CREAM } })
    .composite([
      { input: art, left: frontLeft, top: height - artHeight },
      { input: Buffer.from(svg), left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
  // 製本直送.comの推奨に合わせてCMYK（ICCプロファイル付き）にする
  return sharp(rgbImage)
    .withIccProfile("cmyk")
    .withDensity(DPI)
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

type Font = ReturnType<typeof fontkit.create>;

const advance = (font: Font, text: string, size: number) =>
  (font.layout(text).advanceWidth * size) / font.unitsPerEm;

function fitSize(font: Font, text: string, size: number, maxWidth: number) {
  let s = size;
  while (s > 8 && advance(font, text, s) > maxWidth) s -= 1;
  return s;
}

// 文字を centerX を中心に、baseline の高さに並べたパス（y は上から下）
function textPath(font: Font, text: string, size: number, centerX: number, baseline: number, color: string) {
  const run = font.layout(text);
  const k = size / font.unitsPerEm;
  let x = centerX - advance(font, text, size) / 2;
  const parts: string[] = [];
  run.glyphs.forEach((glyph, i) => {
    const pos = run.positions[i];
    const d = glyph.path.toSVG();
    if (d) {
      const gx = x + pos.xOffset * k;
      const gy = baseline - pos.yOffset * k;
      parts.push(`<path transform="translate(${gx.toFixed(2)} ${gy.toFixed(2)}) scale(${k} ${-k})" d="${d}"/>`);
    }
    x += pos.xAdvance * k;
  });
  return `<g fill="${color}">${parts.join("")}</g>`;
}
