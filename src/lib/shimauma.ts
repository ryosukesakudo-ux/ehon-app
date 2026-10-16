import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import sharp, { type Sharp } from "sharp";
import { CORAL, CREAM, INK, NAVY, SAFE_MM, drawCentered, drawCoverText, drawParagraph, fitSize, mm, type Color, type Surface, type TextFont } from "@/lib/print-pdf";
import { buildZip } from "@/lib/zip";

// しまうまプリントのフォトブックに入れる画像を、ZIPにまとめて作る。
// 表紙は、題名入りの正方形（表紙.jpg）と、文字の無い横長の絵（表紙_絵だけ.jpg）の2つ。
// - しまうまの編集画面では文字を好きな位置に置けないので、文章もページの画像にする。1ページに1枚、全面に置いてもらう。
// - 写真を置けるページ数が決まっている（中表紙・奥付を除く）。見開き（左：文章 / 右：絵）で入りきらない分は、
//   最後の場面から順に1ページに文章と絵をまとめて、12場面すべてを入れる。扉・おしまい・奥付は入れない（しまうまの中表紙と奥付がつく）。
// - 画素数はしまうまの推奨に合わせる（https://support.n-pri.jp/hc/ja/articles/360015588492）。
//   塗り足しは無し（しまうまの編集画面が断裁の分を見込む）。
// - 文字の大きさ・折り返しは入稿用PDFと同じ（print-pdf.ts の関数をそのまま使う）。
// - 36ページ（a5square36）は、お話のほかに特別ページを入れる（2026-10-14・10-16 作道さん）。並び順は buildShimaumaZip のとおり。
//   しまうまは1ページ目（右）に中表紙が自動で入って編集できないので、写真のページは2ページ目（左）から。
//   見開きの左右がずれないよう、2ページ組のもの（登場人物しょうかい・お話の場面）は偶数ページから始める。

export const SHIMAUMA_PRODUCTS = {
  // PICTURES B5スクエア 24ページ：中表紙を除く23ページ（https://www.n-pri.jp/photobook/pictures/）
  pictures: { label: "PICTURES 182mm角", trimMm: 182, pagePx: 2267, coverPx: 2385, pages: 23 },
  // 通常フォトブック A5スクエア 24ページ：表紙1枚＋22ページ（https://support.n-pri.jp/hc/ja/articles/42943785422361）
  a5square: { label: "フォトブック 148mm角", trimMm: 148, pagePx: 1866, coverPx: 1984, pages: 22 },
  // 通常フォトブック A5スクエア 36ページ：表紙1枚＋34ページ（2〜35ページ）。いま売っている本（catalog.ts の SIZES）。お話24ページ＋特別ページ10ページ
  a5square36: { label: "フォトブック 148mm角・36ページ", trimMm: 148, pagePx: 1866, coverPx: 1984, pages: 34, extras: true },
} as const satisfies Record<string, { label: string; trimMm: number; pagePx: number; coverPx: number; pages: number; extras?: boolean }>;
export type ShimaumaProduct = keyof typeof SHIMAUMA_PRODUCTS;

const SINGLE_ART = 0.5; // 文章と絵を1ページにまとめるときの絵の大きさ（ページの1辺に対して）

const FONT_DIR = path.join(process.cwd(), "assets/fonts");

export type ShimaumaInput = {
  title: { lead: string; main: string };
  texts: string[]; // 場面ごとの文章（12）
  images: Buffer[]; // 場面ごとの絵（12、正方形）
  /**
   * 見開きの絵（2026-10-15 からのお客様の本）の場面の、文を重ねた左右のページの画像（spread-book.ts の renderSpreadPages）。
   * null の場面（正方形の絵）は今までどおり「左に文・右に絵」
   */
  spreadPages?: ([Buffer, Buffer] | null)[];
  coverImage: Buffer; // 表紙の絵（横長 3:2）
  volume: number;
  /** 注文の通し番号（お支払いが済んだ順）。ファイル名の先頭 No0012_ に使う */
  serial: number;
  /** 特別ページの内容（36ページの本だけ） */
  extras?: ShimaumaExtras;
};

/** 特別ページ（登場人物しょうかい・思い出の写真・よんだ日・メッセージ）に入れる内容 */
export type ShimaumaExtras = {
  /** 呼び方をつけた名前（例：はるとくん） */
  called: string;
  /** おうちの方からのメッセージ。空なら通し番号だけのページ */
  message: string;
  /** 思い出の写真（アップした順、20枚まで）。6ページに分けて並べ、足りないページはおえかきページ */
  memoryPhotos: Buffer[];
  /** 通し番号（No.0001） */
  serial: number;
  /** 登場人物（キャラクターの絵と名前）。主人公が先頭 */
  characters: { name: string; image: Buffer }[];
};

/** 思い出の写真を並べるページの数 */
export const PHOTO_PAGES = 6;
/** 特別ページの数（お話の前に登場人物しょうかい2ページ、後ろに写真6ページ・よんだ日・メッセージ） */
const EXTRA_PAGES = 2 + PHOTO_PAGES + 2;

export async function buildShimaumaZip(input: ShimaumaInput, product: ShimaumaProduct) {
  const spec: { trimMm: number; pagePx: number; coverPx: number; pages: number; extras?: boolean } = SHIMAUMA_PRODUCTS[product];
  const { trimMm, pagePx: PAGE_PX, coverPx: COVER_PX } = spec;
  const extras = spec.extras ? input.extras : undefined;
  if (spec.extras && !extras) throw new Error("特別ページの内容がありません");
  const pages = spec.pages - (extras ? EXTRA_PAGES : 0);
  const { body, bold } = await loadPathFonts();
  const size = mm(trimMm);
  const scale = trimMm / 210; // 入稿用PDFと同じく21cm角を基準に文字の大きさをそろえる
  const textSize = 18 * scale;
  const files: { name: string; bytes: Buffer }[] = [];
  // ファイル名の先頭に注文の通し番号（No0012_）をつけて、別の注文の画像と取り違えないようにする
  const prefix = `No${String(input.serial).padStart(4, "0")}_`;
  const jpeg = (img: Sharp) => img.jpeg({ quality: 92 }).toBuffer();
  const art = (img: Buffer, px: number, h = px) => sharp(img).flatten({ background: "#ffffff" }).resize(px, h, { fit: "cover" }).toBuffer();

  // 表紙：入稿用PDFの表紙と同じ（上1/3にタイトルの帯、下2/3に表紙の絵）
  {
    files.push({ name: `${prefix}表紙.jpg`, bytes: await renderCover({ title: input.title, volume: input.volume, coverImage: input.coverImage, trimMm, px: COVER_PX, bold }) });
    // しまうまの表紙デザインは写真の枠が横長で、題名はしまうまの文字欄に入れる形なので、文字の無い表紙の絵（3:2）も入れておく
    files.push({ name: `${prefix}表紙_絵だけ.jpg`, bytes: await jpeg(sharp(await art(input.coverImage, COVER_PX, Math.round((COVER_PX * 2) / 3)))) });
  }

  // 本文：ファイル名の順（しまうまの「自動配置」の「ファイル名順」）で並ぶように 01〜 の番号をつける
  // 見開きにする場面の数（残りの場面は1ページに文章と絵をまとめる）
  const spreads = Math.min(input.texts.length, pages - input.texts.length);
  let no = 1;
  const name = (label: string) => `${prefix}${String(no++).padStart(2, "0")}_${label}.jpg`;
  const ex = extras ? new ExtraPages({ size, trimMm, px: PAGE_PX, body, bold, scale }) : null;

  // 特別ページ（お話の前）：登場人物しょうかい（2〜3ページの見開き）
  if (extras && ex) {
    const [left, right] = await ex.characters(extras);
    files.push({ name: name("登場人物_1"), bytes: left });
    files.push({ name: name("登場人物_2"), bytes: right });
  }
  for (let i = 0; i < spreads; i++) {
    const both = input.spreadPages?.[i];
    if (both) {
      files.push({ name: name(`場面${i + 1}_左`), bytes: both[0] });
      files.push({ name: name(`場面${i + 1}_右`), bytes: both[1] });
      continue;
    }
    const page = new SvgPage(size, CREAM);
    drawParagraph(page, input.texts[i], body, textSize, size, mm(trimMm * 0.68), mm(trimMm * 0.72));
    files.push({ name: name(`場面${i + 1}_文`), bytes: await jpeg(sharp(page.toSvg(PAGE_PX))) });
    files.push({ name: name(`場面${i + 1}_絵`), bytes: await jpeg(sharp(await art(input.images[i], PAGE_PX))) });
  }

  // 残りの場面：上に文章、下に絵（1ページにまとめる）
  for (let i = spreads; i < input.texts.length; i++) {
    const page = new SvgPage(size);
    const artSize = size * SINGLE_ART;
    const artBottom = mm(SAFE_MM);
    const top = size - mm(SAFE_MM);
    const textBottom = artBottom + artSize + mm(6);
    drawParagraph(page, input.texts[i], body, textSize, size, mm(trimMm - SAFE_MM * 2), top - textBottom, (top + textBottom) / 2);
    const artPx = Math.round(PAGE_PX * SINGLE_ART);
    files.push({
      name: name(`場面${i + 1}`),
      bytes: await jpeg(
        cream(PAGE_PX).composite([
          { input: await art(input.images[i], artPx), left: Math.round((PAGE_PX - artPx) / 2), top: Math.round(PAGE_PX * (1 - (artBottom + artSize) / size)) },
          { input: page.toSvg(PAGE_PX), left: 0, top: 0 },
        ]),
      ),
    });
  }

  // 特別ページ（お話の後ろ）：思い出の写真6ページ（28〜33ページ）、よんだ日、メッセージと通し番号
  if (extras && ex) {
    for (const [i, page] of (await ex.photoPages(extras)).entries()) files.push({ name: name(`思い出の写真_${i + 1}`), bytes: page });
    files.push({ name: name("よんだ日"), bytes: await ex.readDates() });
    files.push({ name: name("メッセージ"), bytes: await ex.message(extras) });
  }

  if (no - 1 !== spec.pages) throw new Error(`ページの数が合いません（${no - 1}／${spec.pages}）`);
  return { zip: buildZip(files), pages: no - 1 };
}

export const jpegOf = (img: Sharp) => img.jpeg({ quality: 92 }).toBuffer();

/** 本文（丸ゴシック）と題名（太い丸ゴシック）のフォント */
export async function loadPathFonts() {
  const [body, bold] = await Promise.all(
    ["ZenMaruGothic-Medium.ttf", "MPLUSRounded1c-ExtraBold.ttf"].map(async (f) => new PathFont(await readFile(path.join(FONT_DIR, f)))),
  );
  return { body, bold };
}

/** 題名入りの正方形の表紙（上1/3にタイトルの帯、下2/3に表紙の絵）。入稿用PDFの表紙と同じ */
export async function renderCover(o: { title: { lead: string; main: string }; volume: number; coverImage: Buffer; trimMm: number; px: number; bold: PathFont }) {
  const size = mm(o.trimMm);
  const page = new SvgPage(size);
  const artHeight = (size * 2) / 3;
  drawCoverText(page, { title: o.title, volume: o.volume, font: o.bold, size, bleed: 0, artHeight, scale: o.trimMm / 210, textWidth: mm(o.trimMm - SAFE_MM * 2) });
  const artPx = Math.round((o.px * 2) / 3);
  const art = await sharp(o.coverImage).flatten({ background: "#ffffff" }).resize(o.px, artPx, { fit: "cover" }).toBuffer();
  return jpegOf(
    cream(o.px).composite([
      { input: art, left: 0, top: o.px - artPx },
      { input: page.toSvg(o.px), left: 0, top: 0 },
    ]),
  );
}

/** 特別ページを1枚ずつ画像にする（どれも塗り足し無しの正方形、クリーム色の地） */
export class ExtraPages {
  constructor(private o: { size: number; trimMm: number; px: number; body: PathFont; bold: PathFont; scale: number }) {}

  /** 文字・線を描く面（地は透明。クリーム色の地と絵・写真の上に重ねる） */
  private page() {
    return new SvgPage(this.o.size);
  }
  /** ポイントの座標（左下が原点）を画素の座標（左上が原点）に */
  private toPx(v: number) {
    return Math.round((v / this.o.size) * this.o.px);
  }
  private get width() {
    return mm(this.o.trimMm - SAFE_MM * 2);
  }
  private title(page: SvgPage, text: string, y: number, size = 20) {
    const { bold, scale, size: s } = this.o;
    drawCentered(page, s, text, bold, fitSize(text, bold, size * scale, this.width), NAVY, y);
  }
  private line(page: SvgPage, text: string, y: number, size = 14, color: Color = INK) {
    const { body, scale, size: s } = this.o;
    drawCentered(page, s, text, body, fitSize(text, body, size * scale, this.width), color, y);
  }
  private brand(page: SvgPage) {
    this.line(page, "えほん Only Yours", mm(SAFE_MM - 4), 9, CORAL);
  }
  private async render(page: SvgPage, images: { input: Buffer; left: number; top: number }[] = []) {
    const { px } = this.o;
    return jpegOf(cream(px).composite([...images, { input: page.toSvg(px), left: 0, top: 0 }]));
  }
  /** 正方形に切りそろえた画像（px 角） */
  private async square(img: Buffer, px: number, fit: "cover" | "contain" = "cover") {
    return sharp(img).flatten({ background: hex(CREAM) }).resize(px, px, { fit, background: hex(CREAM) }).toBuffer();
  }

  /**
   * 2〜3 登場人物しょうかい（見開き）。左のページに主人公を大きく1人、右のページにほかの人を小さく並べる（2026-10-16 作道さん）。
   * 主人公だけのときは、右のページを「かぞくの かお」のおえかきにする
   */
  async characters(e: ShimaumaExtras): Promise<[Buffer, Buffer]> {
    const [hero, ...others] = e.characters;
    const left = await this.characterPage(hero ? [hero] : [], { title: true, cols: 1, maxArt: 0.62 });
    if (!others.length) return [left, await this.drawing("かぞくの かおを かいてね")];
    // ほかの人は1ページに 2列（5人からは3列）。人数が少なくても大きくしすぎない
    const cols = others.length <= 4 ? 2 : 3;
    return [left, await this.characterPage(others, { title: false, cols, maxArt: 0.3 })];
  }

  private async characterPage(list: ShimaumaExtras["characters"], o: { title: boolean; cols: number; maxArt: number }) {
    const { size, px, scale } = this.o;
    const page = this.page();
    const top = size - mm(SAFE_MM);
    if (o.title) this.title(page, "とうじょう じんぶつ", top - 20 * scale);
    const cols = Math.min(o.cols, Math.max(list.length, 1));
    const rows = Math.max(1, Math.ceil(list.length / cols));
    // 見出しの分（左のページ）は上を空ける。右のページも同じ高さから並べて、左右で絵の上がそろうようにする
    const areaTop = top - 40 * scale;
    const areaBottom = mm(SAFE_MM);
    const cellW = this.width / cols;
    const cellH = (areaTop - areaBottom) / rows;
    const label = (o.title ? 18 : 13) * scale;
    const art = Math.min(cellW * 0.9, cellH - label * 2.4, size * o.maxArt);
    const images: { input: Buffer; left: number; top: number }[] = [];
    for (let i = 0; i < list.length; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      // 最後の段は人数が少なければ真ん中に寄せる
      const inRow = r === rows - 1 ? list.length - cols * r : cols;
      const cx = mm(SAFE_MM) + (this.width - cellW * inRow) / 2 + cellW * (c + 0.5);
      const cellTop = areaTop - cellH * r;
      const artTop = cellTop - (cellH - art - label * 2.4) / 2;
      const artPx = this.toPx(art);
      images.push({ input: await this.square(list[i].image, artPx, "contain"), left: this.toPx(cx - art / 2), top: px - this.toPx(artTop) });
      const { bold } = this.o;
      const name = list[i].name;
      const s = fitSize(name, bold, label, cellW * 0.95);
      page.drawText(name, { x: cx - bold.widthOfTextAtSize(name, s) / 2, y: artTop - art - label * 1.5, size: s, font: bold, color: NAVY });
    }
    return this.render(page, images);
  }

  /**
   * 28〜33 思い出の写真（6ページ）。アップした順に、1ページの枚数がほぼ同じになるよう前のページから多めに分ける（20枚なら 4・4・3・3・3・3）。
   * 6枚より少ないときは1ページに1枚ずつ入れ、残りのページはおえかきページにする（2026-10-16 作道さん）
   */
  async photoPages(e: ShimaumaExtras) {
    const photos = e.memoryPhotos;
    const counts = Array.from({ length: PHOTO_PAGES }, (_, i) => Math.floor(photos.length / PHOTO_PAGES) + (i < photos.length % PHOTO_PAGES ? 1 : 0));
    const drawings = ["すきな ばめんを かいてね", "この おはなしの つづきを かいてね", "つぎは どこへ いきたい？", `${e.called}の かおを かいてね`, "すきな ものを かいてね", "かぞくの えを かいてね"];
    const pages: Buffer[] = [];
    let next = 0;
    for (const n of counts) {
      if (n) pages.push(await this.photoPage(photos.slice(next, (next += n))));
      else pages.push(await this.drawing(drawings[pages.length % drawings.length]));
    }
    return pages;
  }

  /** 写真1〜4枚を1ページに。1枚：大きく1枚 / 2枚：上下 / 3枚：上に横長1枚・下に2枚 / 4枚：2×2。白い縁をつける */
  private async photoPage(photos: Buffer[]) {
    const { size, px } = this.o;
    const gap = mm(4);
    const left = mm(SAFE_MM);
    const bottom = mm(SAFE_MM);
    const w = this.width;
    const h = size - mm(SAFE_MM) * 2;
    // 写真の枠（左下が原点のポイント）
    const half = (h - gap) / 2;
    const halfW = (w - gap) / 2;
    const cells: { x: number; y: number; w: number; h: number }[] =
      photos.length === 1
        ? [{ x: left, y: bottom, w, h }]
        : photos.length === 2
          ? [{ x: left, y: bottom + half + gap, w, h: half }, { x: left, y: bottom, w, h: half }]
          : photos.length === 3
            ? [{ x: left, y: bottom + half + gap, w, h: half }, { x: left, y: bottom, w: halfW, h: half }, { x: left + halfW + gap, y: bottom, w: halfW, h: half }]
            : [0, 1, 2, 3].map((i) => ({ x: left + (i % 2) * (halfW + gap), y: bottom + (i < 2 ? half + gap : 0), w: halfW, h: half }));
    const border = mm(1.6);
    const page = this.page();
    for (const c of cells) page.drawFrame({ x: c.x, y: c.y, width: c.w, height: c.h, color: CREAM, lineWidth: 0, radius: 0 });
    const base = await this.render(page);
    const layers = await Promise.all(
      cells.map(async (c, i) => {
        const wPx = this.toPx(c.w - border * 2);
        const hPx = this.toPx(c.h - border * 2);
        // 顔などの目立つところが残るように切る（sharp の attention）
        const input = await sharp(photos[i]).rotate().resize(wPx, hPx, { fit: "cover", position: sharp.strategy.attention }).flatten({ background: "#ffffff" }).toBuffer();
        return { input, left: this.toPx(c.x + border), top: px - this.toPx(c.y + c.h - border) };
      }),
    );
    return jpegOf(sharp(base).composite(layers));
  }

  /** おえかきページ（上に一言、下に大きな枠） */
  async drawing(caption: string) {
    const { size } = this.o;
    const page = this.page();
    const top = size - mm(SAFE_MM);
    this.line(page, caption, top - 12 * this.o.scale, 14, NAVY);
    const left = mm(SAFE_MM);
    const bottom = mm(SAFE_MM);
    page.drawFrame({ x: left, y: bottom, width: this.width, height: top - 28 * this.o.scale - bottom, color: CORAL, lineWidth: 1.2, radius: mm(4) });
    return this.render(page);
  }

  /** この本を よんだ日（日付を書きこむ線） */
  async readDates() {
    const { size, body, scale } = this.o;
    const page = this.page();
    this.title(page, "この ほんを よんだ ひ", size - mm(SAFE_MM) - 22 * scale);
    const fs = 13 * scale;
    const x = mm(SAFE_MM + 6);
    const w = this.width - mm(12);
    const label = "ねん　　　がつ　　　にち";
    for (let i = 0; i < 6; i++) {
      const y = size * 0.66 - i * fs * 3.4;
      const lw = body.widthOfTextAtSize(label, fs);
      page.drawText(label, { x: x + w - lw, y, size: fs, font: body, color: INK });
      page.drawRectangle({ x, y: y - fs * 0.5, width: w, height: 0.6, color: CORAL, opacity: 0.6 });
    }
    this.brand(page);
    return this.render(page);
  }

  /** 最後のページ：おうちの方からのメッセージと通し番号 */
  async message(e: ShimaumaExtras) {
    const { size, body, scale } = this.o;
    const page = this.page();
    const text = e.message.replace(/\s*\n\s*/g, " ").trim();
    if (text) {
      this.title(page, `${e.called}へ`, size - mm(SAFE_MM) - 20 * scale, 18);
      this.line(page, "おうちの ひとから", size - mm(SAFE_MM) - 40 * scale, 11, CORAL);
      drawParagraph(page, text, body, 14 * scale, size, size * 0.74, size * 0.4, size * 0.5);
    }
    this.title(page, "せかいに 1さつだけの えほん", text ? size * 0.2 : size * 0.55, text ? 12 : 18);
    this.line(page, `No.${String(e.serial).padStart(4, "0")}`, text ? size * 0.13 : size * 0.45, text ? 12 : 16, NAVY);
    this.brand(page);
    return this.render(page);
  }
}

export const cream = (px: number) => sharp({ create: { width: px, height: px, channels: 3, background: hex(CREAM) } });

export function hex(c: Color) {
  return `#${[c.red, c.green, c.blue].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** 文字の輪郭（パス）で描くフォント。サーバーに日本語フォントが無くても画像に文字を描ける */
export class PathFont implements TextFont {
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
export class SvgPage implements Surface<PathFont> {
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
  /** 角の丸い枠線（おえかきページ） */
  drawFrame(o: { x: number; y: number; width: number; height: number; color: Color; lineWidth: number; radius: number }) {
    this.parts.push(
      `<rect x="${o.x}" y="${this.size - o.y - o.height}" width="${o.width}" height="${o.height}" rx="${o.radius}" fill="#ffffff" stroke="${hex(o.color)}" stroke-width="${o.lineWidth}"/>`,
    );
  }
  toSvg(px: number) {
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${this.size} ${this.size}">${this.parts.join("")}</svg>`);
  }
}
