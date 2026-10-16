import "server-only";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { CREAM, INK, drawParagraph, fitSize, mm } from "@/lib/print-pdf";
import { ExtraPages, SvgPage, cream, hex, jpegOf, loadPathFonts, renderCover, type ShimaumaExtras } from "@/lib/shimauma";
import type { SpreadTextSpot } from "@/lib/series";

// 見開き版の本の試作（2026-10-15 作道さん）：しまうま A5スクエア36ページと同じ並びで、表紙から最後のページまでを見開きごとの画像とPDFにする。
// お話の12場面は、左右2ページにまたがる絵（横長の絵の上下を切って 2:1）に、文を人物・動物のいない所（AIが選んだ場所）に白い四角を敷いて重ねる。
// 特別ページは、しまうま用ZIPと同じ描き方（ExtraPages）。ページの並び（1ページ目は右のページ。2026-10-16 作道さん）：
//   1 しまうまが自動で入れる中表紙（題名だけ）/ 2-3 登場人物しょうかい / 4-27 お話12場面（見開き）/ 28-33 思い出の写真 / 34 よんだ日 / 35 メッセージ

export type SpreadBookScene = { image: Buffer; text: string; spot: SpreadTextSpot };

export type SpreadBookInput = {
  title: { lead: string; main: string };
  volume: number;
  coverImage: Buffer;
  scenes: SpreadBookScene[];
  extras: ShimaumaExtras;
};

const TRIM_MM = 148;
const PAGE_PX = 1866;
/** 画面で見る画像の、見開き1枚の横幅 */
const VIEW_W = 1600;

export async function buildSpreadBook(input: SpreadBookInput) {
  const { body, bold } = await loadPathFonts();
  const size = mm(TRIM_MM);
  const scale = TRIM_MM / 210;
  const ex = new ExtraPages({ size, trimMm: TRIM_MM, px: PAGE_PX, body, bold, scale });
  const e = input.extras;
  const blank = await jpegOf(cream(PAGE_PX));

  // 見開きごとの画像（左右2ページ分、2:1）。表紙だけは1ページ
  const spreads: { label: string; image: Buffer }[] = [];
  const pair = async (label: string, left: Buffer, right: Buffer) =>
    spreads.push({ label, image: await jpegOf(sharp({ create: { width: PAGE_PX * 2, height: PAGE_PX, channels: 3, background: hex(CREAM) } }).composite([{ input: left, left: 0, top: 0 }, { input: right, left: PAGE_PX, top: 0 }])) });

  const cover = await renderCover({ title: input.title, volume: input.volume, coverImage: input.coverImage, trimMm: TRIM_MM, px: PAGE_PX, bold });
  await pair("1ページ：中表紙（しまうまが自動で入れる）", blank, await titlePage(input.title, bold, TRIM_MM, PAGE_PX));
  const [c1, c2] = await ex.characters(e);
  await pair("2〜3ページ：登場人物しょうかい", c1, c2);
  for (let i = 0; i < input.scenes.length; i++) {
    spreads.push({ label: `${4 + i * 2}〜${5 + i * 2}ページ：場面${i + 1}`, image: await sceneSpread(input.scenes[i], body, TRIM_MM, PAGE_PX) });
  }
  const photos = await ex.photoPages(e);
  for (let i = 0; i < photos.length; i += 2) await pair(`${28 + i}〜${29 + i}ページ：思い出の写真`, photos[i], photos[i + 1]);
  await pair("34〜35ページ：よんだ日・メッセージと通し番号", await ex.readDates(), await ex.message(e));

  // PDF：表紙（正方形）と見開き（2:1）を1枚ずつ
  const pdf = await PDFDocument.create();
  const coverImg = await pdf.embedJpg(cover);
  pdf.addPage([size, size]).drawImage(coverImg, { x: 0, y: 0, width: size, height: size });
  for (const s of spreads) {
    const img = await pdf.embedJpg(s.image);
    pdf.addPage([size * 2, size]).drawImage(img, { x: 0, y: 0, width: size * 2, height: size });
  }

  // 画面で見る用に縮めた画像
  const view = [
    { label: "表紙", image: await sharp(cover).resize(VIEW_W / 2).jpeg({ quality: 82 }).toBuffer() },
    ...(await Promise.all(spreads.map(async (s) => ({ label: s.label, image: await sharp(s.image).resize(VIEW_W).jpeg({ quality: 82 }).toBuffer() })))),
  ];
  return { pdf: Buffer.from(await pdf.save()), view };
}

/** しまうまの中表紙の見本（右寄せの題名だけ。実物はしまうまが表紙に入力した題名で入れる） */
async function titlePage(title: { lead: string; main: string }, bold: Awaited<ReturnType<typeof loadPathFonts>>["bold"], trimMm: number, px: number) {
  const size = mm(trimMm);
  const page = new SvgPage(size);
  const scale = trimMm / 210;
  const right = size - mm(14);
  const lines = [
    { text: title.lead || title.main, size: 17 * scale },
    ...(title.lead ? [{ text: title.main, size: 11 * scale }] : []),
  ];
  let y = size * 0.5;
  for (const l of lines) {
    const s = fitSize(l.text, bold, l.size, size - mm(28));
    page.drawText(l.text, { x: right - bold.widthOfTextAtSize(l.text, s), y, size: s, font: bold, color: INK });
    y -= s * 1.8;
  }
  return jpegOf(sharp({ create: { width: px, height: px, channels: 3, background: "#ffffff" } }).composite([{ input: page.toSvg(px), left: 0, top: 0 }]));
}

/**
 * お客様の本の印刷用（しまうま用ZIP・入稿PDF）に、見開きの絵の場面を左右のページの画像にする。
 * spots が null の場面（見開きに切り替える前の正方形の絵）は null のまま返し、今までどおり「左に文・右に絵」で組んでもらう
 */
export async function renderSpreadPages(o: {
  images: Buffer[];
  texts: string[];
  spots: (SpreadTextSpot | null)[];
  trimMm: number;
  pagePx: number;
  /** 折れ目側で左右のページに重ねる幅（px）。しまうま用は SHIMAUMA_SEAM_OVERLAP */
  seamOverlap?: number;
}) {
  if (!o.spots.some(Boolean)) return o.spots.map(() => null);
  const { body } = await loadPathFonts();
  const out: ([Buffer, Buffer] | null)[] = [];
  for (let i = 0; i < o.images.length; i++) {
    const spot = o.spots[i];
    const overlap = o.seamOverlap ?? 0;
    out.push(spot ? await splitSpread(await sceneSpread({ image: o.images[i], text: o.texts[i], spot }, body, o.trimMm, o.pagePx, overlap), o.pagePx, overlap) : null);
  }
  return out;
}

/**
 * しまうまの編集画面で、写真の端が枠の外に出て隠れる幅（1ページの幅に対して）。
 * 2026-10-16 作道さんの画面で確認：「写真枠にフィット」（拡大・縮小100%）だと画像は枠より大きく、93%でちょうど枠に収まる
 * → 四方が約3.5%ずつ枠の外に出る。折れ目側はこの幅だけ左右のページを重ねて作り、枠に収まった絵どうしがつながるようにする。
 * （7%にしたら、しまうまのプレビューで折れ目の両側に同じ絵が重なって見えた。斜線の「印刷保証外」は綴じの内側で、ここには含めない）
 */
export const SHIMAUMA_SEAM_OVERLAP = 0.035;

/**
 * 見開き1枚（左右2ページ分の画像）を、左のページと右のページの画像に分ける（しまうまは1ページずつ入れるため）。
 * overlap（px）を指定すると、見開きの横幅は 2ページ−2×overlap で、右のページは左のページと 2×overlap 重なる（折れ目側の隠れる分）
 */
export async function splitSpread(spread: Buffer, pagePx: number, overlap = 0): Promise<[Buffer, Buffer]> {
  return Promise.all([0, pagePx - overlap * 2].map((left) => jpegOf(sharp(spread).extract({ left, top: 0, width: pagePx, height: pagePx })))) as Promise<[Buffer, Buffer]>;
}

/**
 * お話の1場面の見開き。横長の絵を 2:1 に切って左右2ページに広げ、文を spot の位置に、白い四角（不透明度40%）を敷いて黒い字で重ねる。
 * 文の枠は絵スタジオの見開きの試作と同じ（見開きの横幅の約44%＝ほぼ1ページ、高さは最大60%）。
 * trimMm は1ページの仕上がりの1辺、pagePx は1ページの画素数（お客様の本のしまうま用ZIP・入稿PDFでも使う）
 */
export async function sceneSpread(
  scene: SpreadBookScene,
  body: Awaited<ReturnType<typeof loadPathFonts>>["body"],
  trimMm: number,
  pagePx: number,
  /** 折れ目側で左右のページを重ねる幅（px）。重ねる分だけ見開きの横幅を狭くする（splitSpread で同じ値を使う） */
  overlap = 0,
) {
  const PAGE_PX = pagePx;
  const size = mm(trimMm);
  const scale = trimMm / 210;
  const W = PAGE_PX * 2 - overlap * 2;
  const H = PAGE_PX;
  // 横長の絵（3:2）を見開き（2:1）に合わせるので上下が切れる。真ん中で切らず、顔など目立つところが残る位置で切る
  const art = await sharp(scene.image).flatten({ background: "#ffffff" }).resize(W, H, { fit: "cover", position: sharp.strategy.attention }).toBuffer();
  if (!scene.text) return jpegOf(sharp(art));

  // 文を1ページ分の透明な面に描いて、文字のある範囲（四角）を調べる
  const [side, vert] = scene.spot.split("-") as ["left" | "right", "top" | "middle" | "bottom"];
  const page = new SvgPage(size);
  drawParagraph(page, scene.text, body, 18 * scale, size, size * 0.8, size * 0.56);
  const layer = await sharp(page.toSvg(PAGE_PX)).png().toBuffer();
  const { info } = await sharp(layer).trim().toBuffer({ resolveWithObject: true });
  const textW = info.width;
  const textH = info.height;
  const textLeft = -(info.trimOffsetLeft ?? 0);
  const textTop = -(info.trimOffsetTop ?? 0);
  const textBuf = await sharp(layer).extract({ left: textLeft, top: textTop, width: textW, height: textH }).toBuffer();

  // 白い四角の位置（そのページの中で左右は真ん中、上下は spot のとおり。ページの端から7%空ける）
  const pad = Math.round(PAGE_PX * 0.04);
  const boxW = textW + pad * 2;
  const boxH = textH + pad * 2;
  const margin = Math.round(PAGE_PX * 0.07);
  const boxLeft = (side === "left" ? 0 : PAGE_PX - overlap * 2) + Math.round((PAGE_PX - boxW) / 2);
  const boxTop = vert === "top" ? margin : vert === "bottom" ? H - margin - boxH : Math.round((H - boxH) / 2);
  const radius = Math.round(PAGE_PX * 0.03);
  const box = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${boxW}" height="${boxH}"><rect width="${boxW}" height="${boxH}" rx="${radius}" fill="#ffffff" fill-opacity="0.4"/></svg>`);
  return jpegOf(
    sharp(art).composite([
      { input: box, left: boxLeft, top: boxTop },
      { input: textBuf, left: boxLeft + pad, top: boxTop + pad },
    ]),
  );
}
