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
  /** 表紙・扉の題名（lead は上の小さい行、main は大きい行） */
  title: { lead: string; main: string };
  childName: string;
  texts: string[]; // 場面ごとの文章（12）。漢字《かな》 はふりがなとして漢字の上に小さく入れる
  images: Buffer[]; // 場面ごとの絵（12、正方形）
  coverImage: Buffer; // 表紙の絵（横長 3:2）
  trimMm: number; // 仕上がりの1辺
  volume: number; // 巻数（同じ主人公の何冊目か）。表紙の右下に小さく入れる
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
  const { lead, main } = input.title;
  const textWidth = mm(input.trimMm - SAFE_MM * 2);

  async function newDoc() {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    // 日本語は部分埋め込みにすると文字が欠けるため、フォントをまるごと埋め込む
    const body = await doc.embedFont(bodyFontBytes, { subset: false });
    const bold = await doc.embedFont(titleFontBytes, { subset: false });
    doc.setTitle(`${lead}${main}`);
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
    drawCentered(page, lead, bold, fitSize(lead, bold, 18 * scale, textWidth), NAVY, size / 2 + 26 * scale);
    drawCentered(page, main, bold, fitSize(main, bold, 30 * scale, textWidth), NAVY, size / 2 - 12 * scale);
    drawCentered(page, "えほん Only Yours", body, 10 * scale, CORAL, mm(BLEED_MM + SAFE_MM));
  }

  // 2〜25 見開き（左：文章 / 右：絵）
  for (let i = 0; i < input.texts.length; i++) {
    const textPage = blank();
    drawParagraph(textPage, input.texts[i], body, 18 * scale, size, mm(input.trimMm * 0.68), mm(input.trimMm * 0.72));
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
      `${lead}${main}`,
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
    const leadSize = fitSize(lead, cover.bold, 20 * scale, textWidth);
    const titleSize = fitSize(main, cover.bold, 34 * scale, textWidth);
    const blockHeight = leadSize + titleSize * 1.4;
    const blockTop = (bandTop + bandBottom) / 2 + blockHeight / 2;
    drawCentered(page, lead, cover.bold, leadSize, CORAL, blockTop - leadSize);
    drawCentered(page, main, cover.bold, titleSize, NAVY, blockTop - leadSize - titleSize * 1.4);
    // 右下に巻数（絵の上に、小さなクリーム色の札を置いて書く）
    const vol = `Vol.${input.volume}`;
    const volSize = 11 * scale;
    const padX = volSize * 0.7;
    const labelW = cover.bold.widthOfTextAtSize(vol, volSize) + padX * 2;
    const labelH = volSize * 1.8;
    const right = size - mm(BLEED_MM + SAFE_MM / 2);
    const bottom = mm(BLEED_MM + SAFE_MM / 2);
    page.drawRectangle({ x: right - labelW, y: bottom, width: labelW, height: labelH, color: CREAM, opacity: 0.92 });
    page.drawText(vol, { x: right - labelW + padX, y: bottom + (labelH - volSize * 0.72) / 2, size: volSize, font: cover.bold, color: NAVY });
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
// 漢字《かな》 は、かなを漢字の上に小さく置く（ふりがな）。行の間は広めにとってあるので、ふりがなが前の行に重ならない。
// 長い文（文の量「多い」）で枠に収まらないときは、収まるまで文字を小さくする。
function drawParagraph(page: PDFPage, text: string, font: PDFFont, size: number, pageSize: number, maxWidth: number, maxHeight: number) {
  const units = toUnits(pdfSafe(text));
  let s = size;
  let lines = wrap(units, font, s, maxWidth);
  while (s > 10 && lines.length * s * 2 > maxHeight) {
    s -= 0.5;
    lines = wrap(units, font, s, maxWidth);
  }
  const lineHeight = s * 2;
  const blockHeight = lineHeight * (lines.length - 1) + s;
  const blockWidth = Math.max(...lines.map((l) => lineWidth(l, font, s)));
  const x0 = (pageSize - blockWidth) / 2;
  let y = pageSize / 2 + blockHeight / 2 - s;
  for (const line of lines) {
    let x = x0;
    for (const u of trimLine(line)) {
      const w = unitWidth(u, font, s);
      const bw = font.widthOfTextAtSize(u.base, s);
      page.drawText(u.base, { x: x + (w - bw) / 2, y, size: s, font, color: INK });
      if (u.ruby) {
        const rs = s * RUBY_SCALE;
        const rw = font.widthOfTextAtSize(u.ruby, rs);
        page.drawText(u.ruby, { x: x + (w - rw) / 2, y: y + s * 1.02, size: rs, font, color: INK });
      }
      x += w;
    }
    y -= lineHeight;
  }
}

const RUBY_SCALE = 0.48;

// フォントに無い文字を、形の近い文字に置きかえる（「――」の横棒はこのフォントに無い）
function pdfSafe(text: string) {
  return text.replaceAll("―", "—");
}

/** 1文字、または ふりがな付きの漢字のまとまり */
type Unit = { base: string; ruby?: string };

const KANJI = /[\u4e00-\u9fff々〆ヶ]/;

export function toUnits(text: string): Unit[] {
  const units: Unit[] = [];
  const re = /《([^》]*)》/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const before = [...text.slice(last, m.index)];
    // 《》の直前に続く漢字が、ふりがなの付く文字
    let k = before.length;
    while (k > 0 && KANJI.test(before[k - 1])) k--;
    for (const ch of before.slice(0, k)) units.push({ base: ch });
    const base = before.slice(k).join("");
    if (base) units.push({ base, ruby: m[1] });
    else units.push(...[...m[1]].map((ch) => ({ base: ch })));
    last = m.index + m[0].length;
  }
  for (const ch of text.slice(last)) units.push({ base: ch });
  return units;
}

function unitWidth(u: Unit, font: PDFFont, size: number) {
  const bw = font.widthOfTextAtSize(u.base, size);
  return u.ruby ? Math.max(bw, font.widthOfTextAtSize(u.ruby, size * RUBY_SCALE)) : bw;
}

function lineWidth(line: Unit[], font: PDFFont, size: number) {
  return trimLine(line).reduce((w, u) => w + unitWidth(u, font, size), 0);
}

function trimLine(line: Unit[]) {
  let end = line.length;
  while (end > 0 && line[end - 1].base === " ") end--;
  return line.slice(0, end);
}

function wrap(units: Unit[], font: PDFFont, size: number, maxWidth: number) {
  const fits = (l: Unit[]) => lineWidth(l, font, size) <= maxWidth;
  // 分かち書きの空白のあとで区切った「ことば」
  const words: Unit[][] = [];
  let cur: Unit[] = [];
  for (const u of units) {
    cur.push(u);
    if (u.base === " ") {
      words.push(cur);
      cur = [];
    }
  }
  if (cur.length) words.push(cur);

  const lines: Unit[][] = [];
  let line: Unit[] = [];
  for (const word of words) {
    if (fits([...line, ...word])) {
      line.push(...word);
      continue;
    }
    if (line.length) lines.push(line);
    line = [];
    for (const u of word) {
      // 句読点やとじかっこは行頭に置かない
      if (!fits([...line, u]) && line.length && !NO_LINE_START.includes(u.base)) {
        lines.push(line);
        line = [];
      }
      line.push(u);
    }
  }
  if (trimLine(line).length) lines.push(line);
  return lines;
}
