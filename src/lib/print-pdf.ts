import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import sharp from "sharp";

// 印刷会社に渡す入稿用PDF。
// - 本文：左に文章・右に絵の見開きを12場面。左綴じなので1ページ目は右ページになる。
//   1 扉 / 2〜25 見開き×12 / 26 おしまい / 27 白 / 28 奥付 の28ページ（4の倍数）。
// - 表紙：上1/3にタイトルの帯、下2/3に表紙専用の横長（3:2）の絵を置いた、おもて表紙1ページ。
//   文字と絵は重ねない（顔に文字が被らないように）。裏・背をつなげた見開きの表紙画像は cover-spread.ts。
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
  coverImage: Buffer; // 表紙の絵（横長 3:2）
  trimMm: number; // 仕上がりの1辺
  issuedAt: Date;
};

export async function buildBookPdfs(input: BookPdfInput) {
  const [bodyFontBytes, titleFontBytes] = await Promise.all([
    readFile(path.join(FONT_DIR, "ZenMaruGothic-Medium.ttf")),
    readFile(path.join(FONT_DIR, "MPLUSRounded1c-ExtraBold.ttf")),
  ]);
  // 印刷用の大きなJPEGに変換しておく（PNGのままだとPDFが重くなりすぎる）
  const toJpeg = (img: Buffer) => sharp(img).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
  const [coverJpeg, ...jpegs] = await Promise.all([input.coverImage, ...input.images].map(toJpeg));

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
    doc.setCreator("えほん Only Yours");
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
    drawCentered(page, "えほん Only Yours", body, 10 * scale, CORAL, mm(BLEED_MM + SAFE_MM));
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
      "え・ぶん：えほん Only Yours（AIでえがきました）",
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
    page.drawRectangle({ x: 0, y: 0, width: size, height: size, color: CREAM });
    // 下2/3に表紙の絵（横幅いっぱい、3:2に切りそろえる）
    const artHeight = (size * 2) / 3;
    const { width: w = 1536 } = await sharp(coverJpeg).metadata();
    const art = await sharp(coverJpeg).resize(w, Math.round((w * 2) / 3), { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();
    const image = await cover.doc.embedJpg(art);
    page.drawImage(image, { x: 0, y: 0, width: size, height: artHeight });
    // 上1/3の帯にタイトル（絵とは重ねない）
    const bandBottom = artHeight;
    const bandTop = size - mm(BLEED_MM);
    const leadSize = 20 * scale;
    const titleSize = fitSize(input.storyName, cover.bold, 34 * scale, mm(input.trimMm - SAFE_MM * 2));
    const blockHeight = leadSize + titleSize * 1.4;
    const blockTop = (bandTop + bandBottom) / 2 + blockHeight / 2;
    drawCentered(page, title, cover.bold, leadSize, CORAL, blockTop - leadSize);
    drawCentered(page, input.storyName, cover.bold, titleSize, NAVY, blockTop - leadSize - titleSize * 1.4);
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
