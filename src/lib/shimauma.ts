import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import sharp, { type Sharp } from "sharp";
import { CREAM, SAFE_MM, drawCoverText, drawParagraph, mm, type Color, type Surface, type TextFont } from "@/lib/print-pdf";
import { buildZip } from "@/lib/zip";

// しまうまプリントのフォトブック「PICTURES」B5スクエア（182mm角）24ページに入れる画像を、ZIPにまとめて作る。
// 表紙は、題名入りの正方形（表紙.jpg）と、文字の無い横長の絵（表紙_絵だけ.jpg）の2つ。
// - しまうまの編集画面では文字を好きな位置に置けないので、文章もページの画像にする。1ページに1枚、全面に置いてもらう。
// - PICTURES 24ページは、中表紙を除く23ページに写真を置ける（https://www.n-pri.jp/photobook/pictures/）。
//   見開き（左：文章 / 右：絵）を11場面、最後の場面だけ1ページに文章と絵をまとめて、12場面すべてを入れる。
//   扉・おしまい・奥付は入れない（しまうまの中表紙と奥付がつく）。
// - 画素数はしまうまの推奨（B5スクエア 本身 2267px角、表紙 2385px角）に合わせる
//   （https://support.n-pri.jp/hc/ja/articles/360015588492）。塗り足しは無し（しまうまの編集画面が断裁の分を見込む）。
// - 文字の大きさ・折り返しは入稿用PDFと同じ（print-pdf.ts の関数をそのまま使う）。

export const SHIMAUMA_TRIM_MM = 182;
const PAGE_PX = 2267;
const COVER_PX = 2385;
const LAST_ART = 0.5; // 最後のページの絵の大きさ（ページの1辺に対して）

const FONT_DIR = path.join(process.cwd(), "assets/fonts");

export type ShimaumaInput = {
  title: { lead: string; main: string };
  texts: string[]; // 場面ごとの文章（12）
  images: Buffer[]; // 場面ごとの絵（12、正方形）
  coverImage: Buffer; // 表紙の絵（横長 3:2）
  volume: number;
};

export async function buildShimaumaZip(input: ShimaumaInput) {
  const [body, bold] = await Promise.all(
    ["ZenMaruGothic-Medium.ttf", "MPLUSRounded1c-ExtraBold.ttf"].map(async (f) => new PathFont(await readFile(path.join(FONT_DIR, f)))),
  );
  const size = mm(SHIMAUMA_TRIM_MM);
  const scale = SHIMAUMA_TRIM_MM / 210; // 入稿用PDFと同じく21cm角を基準に文字の大きさをそろえる
  const textSize = 18 * scale;
  const files: { name: string; bytes: Buffer }[] = [];
  const jpeg = (img: Sharp) => img.jpeg({ quality: 92 }).toBuffer();
  const art = (img: Buffer, px: number, h = px) => sharp(img).flatten({ background: "#ffffff" }).resize(px, h, { fit: "cover" }).toBuffer();

  // 表紙：入稿用PDFの表紙と同じ（上1/3にタイトルの帯、下2/3に表紙の絵）
  {
    const page = new SvgPage(size);
    const artHeight = (size * 2) / 3;
    drawCoverText(page, { title: input.title, volume: input.volume, font: bold, size, bleed: 0, artHeight, scale, textWidth: mm(SHIMAUMA_TRIM_MM - SAFE_MM * 2) });
    const artPx = Math.round((COVER_PX * 2) / 3);
    files.push({
      name: "表紙.jpg",
      bytes: await jpeg(
        cream(COVER_PX).composite([
          { input: await art(input.coverImage, COVER_PX, artPx), left: 0, top: COVER_PX - artPx },
          { input: page.toSvg(COVER_PX), left: 0, top: 0 },
        ]),
      ),
    });
    // PICTURESの表紙デザインは写真の枠が横長で、題名はしまうまの文字欄に入れる形なので、文字の無い表紙の絵（3:2）も入れておく
    files.push({ name: "表紙_絵だけ.jpg", bytes: await jpeg(sharp(await art(input.coverImage, COVER_PX, Math.round((COVER_PX * 2) / 3)))) });
  }

  // 本文：ファイル名の順（しまうまの「自動配置」の「ファイル名順」）で並ぶように 01〜23 の番号をつける
  const last = input.texts.length - 1;
  let no = 1;
  const name = (label: string) => `${String(no++).padStart(2, "0")}_${label}.jpg`;
  for (let i = 0; i < last; i++) {
    const page = new SvgPage(size, CREAM);
    drawParagraph(page, input.texts[i], body, textSize, size, mm(SHIMAUMA_TRIM_MM * 0.68), mm(SHIMAUMA_TRIM_MM * 0.72));
    files.push({ name: name(`場面${i + 1}_文`), bytes: await jpeg(sharp(page.toSvg(PAGE_PX))) });
    files.push({ name: name(`場面${i + 1}_絵`), bytes: await jpeg(sharp(await art(input.images[i], PAGE_PX))) });
  }

  // 最後の場面：上に文章、下に絵（1ページにまとめる）
  {
    const page = new SvgPage(size);
    const artSize = size * LAST_ART;
    const artBottom = mm(SAFE_MM);
    const top = size - mm(SAFE_MM);
    const textBottom = artBottom + artSize + mm(6);
    drawParagraph(page, input.texts[last], body, textSize, size, mm(SHIMAUMA_TRIM_MM - SAFE_MM * 2), top - textBottom, (top + textBottom) / 2);
    const artPx = Math.round(PAGE_PX * LAST_ART);
    files.push({
      name: name(`場面${last + 1}`),
      bytes: await jpeg(
        cream(PAGE_PX).composite([
          { input: await art(input.images[last], artPx), left: Math.round((PAGE_PX - artPx) / 2), top: Math.round(PAGE_PX * (1 - (artBottom + artSize) / size)) },
          { input: page.toSvg(PAGE_PX), left: 0, top: 0 },
        ]),
      ),
    });
  }

  return { zip: buildZip(files), pages: no - 1 };
}

const cream = (px: number) => sharp({ create: { width: px, height: px, channels: 3, background: hex(CREAM) } });

function hex(c: Color) {
  return `#${[c.red, c.green, c.blue].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** 文字の輪郭（パス）で描くフォント。サーバーに日本語フォントが無くても画像に文字を描ける */
class PathFont implements TextFont {
  private font: ReturnType<typeof fontkit.create>;
  constructor(bytes: Buffer) {
    this.font = fontkit.create(bytes);
  }
  widthOfTextAtSize(text: string, size: number) {
    return (this.font.layout(text).advanceWidth * size) / this.font.unitsPerEm;
  }
  /** 左端 x・ベースライン y（どちらも上が原点の座標）から並べた文字のパス */
  paths(text: string, size: number, x: number, y: number) {
    const run = this.font.layout(text);
    const k = size / this.font.unitsPerEm;
    const parts: string[] = [];
    run.glyphs.forEach((glyph, i) => {
      const pos = run.positions[i];
      const d = glyph.path.toSVG();
      if (d) parts.push(`<path transform="translate(${(x + pos.xOffset * k).toFixed(2)} ${(y - pos.yOffset * k).toFixed(2)}) scale(${k} ${-k})" d="${d}"/>`);
      x += pos.xAdvance * k;
    });
    return parts.join("");
  }
}

/** PDFのページと同じ描き方（ポイント・左下が原点）で、SVGに描く面 */
class SvgPage implements Surface<PathFont> {
  private parts: string[] = [];
  constructor(
    private size: number,
    background?: Color,
  ) {
    if (background) this.parts.push(`<rect width="${size}" height="${size}" fill="${hex(background)}"/>`);
  }
  drawText(text: string, o: { x: number; y: number; size: number; font: PathFont; color: Color }) {
    this.parts.push(`<g fill="${hex(o.color)}">${o.font.paths(text, o.size, o.x, this.size - o.y)}</g>`);
  }
  drawRectangle(o: { x: number; y: number; width: number; height: number; color: Color; opacity?: number }) {
    this.parts.push(
      `<rect x="${o.x}" y="${this.size - o.y - o.height}" width="${o.width}" height="${o.height}" fill="${hex(o.color)}" fill-opacity="${o.opacity ?? 1}"/>`,
    );
  }
  toSvg(px: number) {
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${this.size} ${this.size}">${this.parts.join("")}</svg>`);
  }
}
