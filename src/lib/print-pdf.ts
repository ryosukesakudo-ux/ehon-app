import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import sharp from "sharp";

// 印刷会社に渡す入稿用PDF。
// - 本文：左に文章・右に絵の見開きを12場面。左綴じなので1ページ目は右ページになる。
//   1 扉 / 2〜25 見開き×12 / 26 おしまい / 27 白 / 28 奥付 の28ページ（4の倍数）。
// - 表紙：1枚目の絵にタイトルを重ねた、おもて表紙1ページ（背と裏は印刷会社の仕様に合わせて別途）。
// どちらも仕上がりサイズの四方に塗り足し3mmをつける。色はRGB。

const BLEED_MM = 3;
const SAFE_MM = 12; // 文字は仕上がり線からこれ以上内側に置く
const mm = (v: number) => (v * 72) / 25.4;

const CREAM = rgb(1, 0.973, 0.925); // #fff8ec
const NAVY = rgb(0.118, 0.184, 0.341); // #1e2f57
const INK = rgb(0.18, 0.227, 0.31); // #2e3a4f
const CORAL = rgb(0.941, 0.541, 0.424); // #f08a6c

const NO_LINE_START = "、。，．」』）！？ーっゃゅょ";

const FONT_DIR = path.join(process.cwd(), "assets/fonts");

export type BookPdfInput = {
  storyName: string;
  childName: string;
  texts: string[]; // 場面ごとの文章（12）
  images: Buffer[]; // 場面ごとの絵（12、正方形）
  trimMm: number; // 仕上がりの1辺
  issuedAt: Date;
};

export async function buildBookPdfs(input: BookPdfInput) {
  const [bodyFontBytes, titleFontBytes] = await Promise.all([
    readFile(path.join(FONT_DIR, "ZenMaruGothic-Medium.ttf")),
    readFile(path.join(FONT_DIR, "MPLUSRounded1c-ExtraBold.ttf")),
  ]);
  // 印刷用の大きなJPEGに変換しておく（PNGのままだとPDFが重くなりすぎる）
  const jpegs = await Promise.all(input.images.map((img) => sharp(img).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer()));

  const size = mm(input.trimMm + BLEED_MM * 2);
  const scale = input.trimMm / 210; // 21cm角を基準に文字の大きさをそろえる
  const title = `${input.childName}の`;

  async function newDoc() {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    // 日本語は部分埋め込みにすると文字が欠けるため、フォントをまるごと埋め込む
    const body = await doc.embedFont(bodyFontBytes, { subset: false });
    const bold = await doc.embedFont(titleFontBytes, { subset: false });
    doc.setTitle(`${title}${input.storyName}`);
    doc.setCreator("わたしの絵本");
    return { doc, body, bold };
  }

  // --- 本文 ---
  const { doc, body, bold } = await newDoc();
  const blank = (bg = CREAM) => {
    const page = doc.addPage([size, size]);
    page.drawRectangle({ x: 0, y: 0, width: size, height: size, color: bg });
    return page;
  };

  // 1 扉
  {
    const page = blank();
    drawCentered(page, title, bold, 18 * scale, NAVY, size / 2 + 26 * scale);
    drawCentered(page, input.storyName, bold, 30 * scale, NAVY, size / 2 - 12 * scale);
    drawCentered(page, "わたしの絵本", body, 10 * scale, CORAL, mm(BLEED_MM + SAFE_MM));
  }

  // 2〜25 見開き（左：文章 / 右：絵）
  for (let i = 0; i < input.texts.length; i++) {
    const textPage = blank();
    drawParagraph(textPage, input.texts[i], body, 18 * scale, size, mm(input.trimMm * 0.68));
    const pageNo = 2 + i * 2;
    drawCentered(textPage, String(pageNo), body, 9 * scale, INK, mm(BLEED_MM + 8));

    const imagePage = doc.addPage([size, size]);
    const image = await doc.embedJpg(jpegs[i]);
    imagePage.drawImage(image, { x: 0, y: 0, width: size, height: size });
  }

  // 26 おしまい / 27 白 / 28 奥付
  drawCentered(blank(), "おしまい", bold, 24 * scale, NAVY, size / 2 - 8 * scale);
  blank();
  {
    const page = blank();
    const d = input.issuedAt;
    const lines = [
      `${title}${input.storyName}`,
      `しゅじんこう：${input.childName}`,
      "え・ぶん：わたしの絵本（AIでえがきました）",
      `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 発行`,
    ];
    const fontSize = 9 * scale;
    const x = mm(BLEED_MM + SAFE_MM + 4);
    lines.forEach((line, n) => {
      page.drawText(line, { x, y: mm(BLEED_MM + SAFE_MM + 4) + (lines.length - 1 - n) * fontSize * 1.9, size: fontSize, font: body, color: INK });
    });
  }
  const bodyPdf = await doc.save();

  // --- おもて表紙 ---
  const cover = await newDoc();
  {
    const page = cover.doc.addPage([size, size]);
    const image = await cover.doc.embedJpg(jpegs[0]);
    page.drawImage(image, { x: 0, y: 0, width: size, height: size });
    // タイトルの帯（上から仕上がりの約3割）
    const bandHeight = mm(BLEED_MM + input.trimMm * 0.3);
    page.drawRectangle({ x: 0, y: size - bandHeight, width: size, height: bandHeight, color: CREAM, opacity: 0.88 });
    const top = size - mm(BLEED_MM + SAFE_MM);
    drawCentered(page, title, cover.bold, 20 * scale, CORAL, top - 20 * scale);
    const titleSize = fitSize(input.storyName, cover.bold, 34 * scale, mm(input.trimMm - SAFE_MM * 2));
    drawCentered(page, input.storyName, cover.bold, titleSize, NAVY, top - 20 * scale - titleSize * 1.5);
  }
  const coverPdf = await cover.doc.save();

  return { body: bodyPdf, cover: coverPdf };
}

function drawCentered(page: PDFPage, text: string, font: PDFFont, size: number, color: ReturnType<typeof rgb>, y: number) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (page.getWidth() - width) / 2, y, size, font, color });
}

// 幅に収まるまで文字を小さくする
function fitSize(text: string, font: PDFFont, size: number, maxWidth: number) {
  let s = size;
  while (s > 8 && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.5;
  return s;
}

// 文章をページの中央に置く。分かち書きの空白で改行し、それでも長いときは文字単位で折り返す。
function drawParagraph(page: PDFPage, text: string, font: PDFFont, size: number, pageSize: number, maxWidth: number) {
  const lines = wrap(text, font, size, maxWidth);
  const lineHeight = size * 2;
  const blockHeight = lineHeight * (lines.length - 1) + size;
  const blockWidth = Math.max(...lines.map((l) => font.widthOfTextAtSize(l, size)));
  const x = (pageSize - blockWidth) / 2;
  let y = pageSize / 2 + blockHeight / 2 - size;
  for (const line of lines) {
    page.drawText(line, { x, y, size, font, color: INK });
    y -= lineHeight;
  }
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= maxWidth;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/(?<= )/)) {
    if (fits(line + word.trimEnd())) {
      line += word;
      continue;
    }
    if (line) lines.push(line.trimEnd());
    line = "";
    for (const ch of word) {
      // 句読点やとじかっこは行頭に置かない
      if (!fits(line + ch) && line && !NO_LINE_START.includes(ch)) {
        lines.push(line);
        line = "";
      }
      line += ch;
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}
