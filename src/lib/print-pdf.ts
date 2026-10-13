import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import sharp from "sharp";
import { toUnits, type Unit } from "./ruby";

// 印刷会社に渡す入稿用PDF。
// - 本文：左に文章・右に絵の見開きを12場面。左綴じなので1ページ目は右ページになる。
//   1 扉 / 2〜25 見開き×12 / 26 おしまい / 27 白 / 28 奥付 の28ページ（4の倍数）。
// - 表紙：上1/3にタイトルの帯、下2/3に表紙専用の横長（3:2）の絵を置いた、おもて表紙1ページ。
//   文字と絵は重ねない（顔に文字が被らないように）。裏・背をつなげた見開きの表紙画像は cover-spread.ts。
// どちらも仕上がりサイズの四方に塗り足し3mmをつける。色はRGB。

const BLEED_MM = 3;
export const SAFE_MM = 12; // 文字は仕上がり線からこれ以上内側に置く
export const mm = (v: number) => (v * 72) / 25.4;

export const CREAM = rgb(1, 0.973, 0.925); // #fff8ec
export const NAVY = rgb(0.118, 0.184, 0.341); // #1e2f57
export const INK = rgb(0.18, 0.227, 0.31); // #2e3a4f
export const CORAL = rgb(0.941, 0.541, 0.424); // #f08a6c

export type Color = ReturnType<typeof rgb>;

/** 文字の幅を測れるフォント（PDFのフォント、またはしまうま用の画像で使う輪郭のフォント） */
export type TextFont = { widthOfTextAtSize(text: string, size: number): number };

/** 文字と四角を描ける面（PDFのページ、またはしまうま用の画像）。座標はポイントで、左下が原点 */
export type Surface<F extends TextFont> = {
  drawText(text: string, options: { x: number; y: number; size: number; font: F; color: Color }): void;
  drawRectangle(options: { x: number; y: number; width: number; height: number; color: Color; opacity?: number }): void;
};

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
    drawCentered(page, size, lead, bold, fitSize(lead, bold, 18 * scale, textWidth), NAVY, size / 2 + 26 * scale);
    drawCentered(page, size, main, bold, fitSize(main, bold, 30 * scale, textWidth), NAVY, size / 2 - 12 * scale);
    drawCentered(page, size, "えほん Only Yours", body, 10 * scale, CORAL, mm(BLEED_MM + SAFE_MM));
  }

  // 2〜25 見開き（左：文章 / 右：絵）
  for (let i = 0; i < input.texts.length; i++) {
    const textPage = blank();
    drawParagraph(textPage, input.texts[i], body, 18 * scale, size, mm(input.trimMm * 0.68), mm(input.trimMm * 0.72));
    const pageNo = 2 + i * 2;
    drawCentered(textPage, size, String(pageNo), body, 9 * scale, INK, mm(BLEED_MM + 8));

    const imagePage = doc.addPage([size, size]);
    const image = await doc.embedJpg(jpegs[i]);
    imagePage.drawImage(image, { x: 0, y: 0, width: size, height: size });
  }

  // 26 おしまい / 27 白 / 28 奥付
  drawCentered(blank(), size, "おしまい", bold, 24 * scale, NAVY, size / 2 - 8 * scale);
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
    drawCoverText(page, { title: input.title, volume: input.volume, font: cover.bold, size, bleed: mm(BLEED_MM), artHeight, scale, textWidth });
  }
  const coverPdf = await cover.doc.save();

  return { body: bodyPdf, cover: coverPdf };
}

/** おもて表紙の文字：上1/3の帯にタイトル（絵とは重ねない）と、右下の巻数。size は塗り足しを含むページの1辺、bleed は塗り足しの幅 */
export function drawCoverText<F extends TextFont>(
  page: Surface<NoInfer<F>>,
  o: { title: { lead: string; main: string }; volume: number; font: F; size: number; bleed: number; artHeight: number; scale: number; textWidth: number },
) {
  const { lead, main } = o.title;
  const { font, size, scale } = o;
  const bandBottom = o.artHeight;
  const bandTop = size - o.bleed;
  const leadSize = fitSize(lead, font, 20 * scale, o.textWidth);
  const titleSize = fitSize(main, font, 34 * scale, o.textWidth);
  const blockHeight = leadSize + titleSize * 1.4;
  const blockTop = (bandTop + bandBottom) / 2 + blockHeight / 2;
  drawCentered(page, size, lead, font, leadSize, CORAL, blockTop - leadSize);
  drawCentered(page, size, main, font, titleSize, NAVY, blockTop - leadSize - titleSize * 1.4);
  // 右下に巻数（絵の上に、小さなクリーム色の札を置いて書く）
  const vol = `Vol.${o.volume}`;
  const volSize = 11 * scale;
  const padX = volSize * 0.7;
  const labelW = font.widthOfTextAtSize(vol, volSize) + padX * 2;
  const labelH = volSize * 1.8;
  const right = size - o.bleed - mm(SAFE_MM / 2);
  const bottom = o.bleed + mm(SAFE_MM / 2);
  page.drawRectangle({ x: right - labelW, y: bottom, width: labelW, height: labelH, color: CREAM, opacity: 0.92 });
  page.drawText(vol, { x: right - labelW + padX, y: bottom + (labelH - volSize * 0.72) / 2, size: volSize, font, color: NAVY });
}

export function drawCentered<F extends TextFont>(page: Surface<NoInfer<F>>, pageWidth: number, text: string, font: F, size: number, color: Color, y: number) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (pageWidth - width) / 2, y, size, font, color });
}

// 幅に収まるまで文字を小さくする
export function fitSize(text: string, font: TextFont, size: number, maxWidth: number) {
  let s = size;
  while (s > 8 && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.5;
  return s;
}

// 文章をページの中央に置く。文ごとに行を改め、分かち書きの空白や「、」のあとで改行し、それでも長いときは文字単位で折り返す。
// 1つの文の行は長さをそろえる（最後の行に「いました。」だけが残るような折り返しにしない。2026-10-12 トライアルの声「改行が変」）。
// 漢字《かな》 は、かなを漢字の上に小さく置く（ふりがな）。行の間は広めにとってあるので、ふりがなが前の行に重ならない。
// 長い文（文の量「多い」）で枠に収まらないときは、収まるまで文字を小さくする。
// centerY を省くとページの上下の真ん中に置く。
export function drawParagraph<F extends TextFont>(page: Surface<NoInfer<F>>, text: string, font: F, size: number, pageSize: number, maxWidth: number, maxHeight: number, centerY = pageSize / 2) {
  const units = toUnits(pdfSafe(text));
  const layout = (byLine: boolean, minSize: number) => {
    let s = size;
    let lines = wrap(units, font, s, maxWidth, byLine);
    while (s > minSize && lines.length * s * 2 > maxHeight) {
      s -= 0.5;
      lines = wrap(units, font, s, maxWidth, byLine);
    }
    return { s, lines };
  };
  // 文（。！？ や 」 の区切り）ごとに行を改める。文が多くて文字がだいぶ小さくなるときだけ、文の途中から続けて書く
  let { s, lines } = layout(true, size * 0.85);
  if (lines.length * s * 2 > maxHeight) ({ s, lines } = layout(false, 10));
  const lineHeight = s * 2;
  const blockHeight = lineHeight * (lines.length - 1) + s;
  const blockWidth = Math.max(...lines.map((l) => lineWidth(l, font, s)));
  const x0 = (pageSize - blockWidth) / 2;
  let y = centerY + blockHeight / 2 - s;
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

function unitWidth(u: Unit, font: TextFont, size: number) {
  const bw = font.widthOfTextAtSize(u.base, size);
  return u.ruby ? Math.max(bw, font.widthOfTextAtSize(u.ruby, size * RUBY_SCALE)) : bw;
}

function lineWidth(line: Unit[], font: TextFont, size: number) {
  return trimLine(line).reduce((w, u) => w + unitWidth(u, font, size), 0);
}

function trimLine(line: Unit[]) {
  let end = line.length;
  while (end > 0 && line[end - 1].base === " ") end--;
  return line.slice(0, end);
}

// 文の終わり（。！？ のあと。うしろに 」 などが続くときはそのあと）と、会話の 」 のあとで区切る
function splitSentences(units: Unit[]) {
  const out: Unit[][] = [];
  let cur: Unit[] = [];
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!cur.length && u.base === " ") continue;
    cur.push(u);
    const next = units[i + 1]?.base;
    const end = (SENTENCE_END.includes(u.base) && !CLOSING.includes(next ?? "")) || (CLOSING_QUOTE.includes(u.base) && (next === " " || next === "「" || next === "『"));
    if (end) {
      out.push(cur);
      cur = [];
    }
  }
  if (trimLine(cur).length) out.push(cur);
  return out;
}

const SENTENCE_END = "。！？!?";
const CLOSING = "」』）)。！？!?…";
const CLOSING_QUOTE = "」』";

function wrap(units: Unit[], font: TextFont, size: number, maxWidth: number, byLine = true) {
  const starts = phraseStarts(units);
  return (byLine ? splitSentences(units) : [units]).flatMap((s) => balanced(s, font, size, maxWidth, starts));
}

// 分かち書きの無い文（文の量「多い」）で、ことばの途中で改行しないように、改行してよい位置（その文字の前）を決める。
// 漢字・カタカナ・「 で始まることばの前と、「の・が・を…」のあとに続く2文字以上のひらがなのことばの前。
const PARTICLES = new Set(["は", "が", "を", "に", "で", "と", "も", "へ", "の", "や", "から", "まで", "ね", "よ"]);
const OPENING = "「『（(";
function phraseStarts(units: Unit[]) {
  const starts = new Set<Unit>();
  if (units.some((u) => u.base === " ")) return starts;
  const at = new Map<number, Unit>();
  let offset = 0;
  for (const u of units) {
    at.set(offset, u);
    offset += u.base.length;
  }
  const text = units.map((u) => u.base).join("");
  let prev = "";
  for (const { segment, index } of new Intl.Segmenter("ja", { granularity: "word" }).segment(text)) {
    const u = at.get(index);
    const head = segment[0];
    const ok =
      u &&
      index > 0 &&
      !NO_LINE_START.includes(head) &&
      !CLOSING.includes(head) &&
      !OPENING.includes(text[index - 1]) &&
      (/[\u4e00-\u9fff々ァ-ヴー「『]/.test(head) || (PARTICLES.has(prev) && /^[ぁ-ゖ]{2,}/.test(segment)));
    if (ok) starts.add(u);
    prev = segment;
  }
  return starts;
}

// 行数は枠の幅いっぱいに詰めたときと同じまま、いちばん長い行ができるだけ短くなる幅で折り返す
function balanced(units: Unit[], font: TextFont, size: number, maxWidth: number, starts: Set<Unit>) {
  const lines = greedy(units, font, size, maxWidth, starts);
  if (lines.length < 2) return lines;
  let lo = 0;
  let hi = maxWidth;
  for (let k = 0; k < 16; k++) {
    const mid = (lo + hi) / 2;
    if (greedy(units, font, size, mid, starts).length <= lines.length) hi = mid;
    else lo = mid;
  }
  return greedy(units, font, size, hi, starts);
}

function greedy(units: Unit[], font: TextFont, size: number, maxWidth: number, starts: Set<Unit>) {
  const fits = (l: Unit[]) => lineWidth(l, font, size) <= maxWidth;
  // 分かち書きの空白や「、」のあと（分かち書きの無い文は、ことばの切れ目）で区切った「ことば」
  const words: Unit[][] = [];
  let cur: Unit[] = [];
  for (const u of units) {
    if (starts.has(u) && trimLine(cur).length) {
      words.push(cur);
      cur = [];
    }
    cur.push(u);
    if (u.base === " " || u.base === "、") {
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
