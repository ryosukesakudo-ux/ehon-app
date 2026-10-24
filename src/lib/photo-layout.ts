// 思い出の写真を1ページに並べる配置（2026-10-19 作道さん）。
// 写真は切らないので、縦横比（幅÷高さ）に合わせて、並び順のまま何段（または何列）に分けるかを全部ためし、
// 写真がいちばん大きく、大きさのばらつきが少ない並べ方を選ぶ。

export type Rect = { x: number; y: number; w: number; h: number };

/** 思い出の写真のページのふちの余白（mm）。しまうまで端が隠れる幅（約3.5%＝約5mm）より内側 */
export const PHOTO_MARGIN_MM = 8;
/** 写真のまわりの白い縁の太さ（mm） */
export const PHOTO_BORDER_MM = 1.6;
/** 白い縁の外側どうしのすき間（mm） */
export const PHOTO_GAP_MM = 4;

/**
 * 1ページに写真を並べたときの、白い縁を含めた枠（左下が原点、単位は size と同じ）。
 * 印刷（shimauma.ts）とトップの見本で同じ並びにするため、ここで計算する
 */
export function photoPageFrames(ratios: number[], size: number, mm: (v: number) => number): Rect[] {
  const border = mm(PHOTO_BORDER_MM);
  const margin = mm(PHOTO_MARGIN_MM);
  // 白い縁の外側どうしが gap だけ空くよう、縁の分を差し引いた範囲に写真そのものを並べる
  const inner = size - margin * 2 - border * 2;
  const rects = layoutPhotos(ratios, { x: margin + border, y: margin + border, w: inner, h: inner }, mm(PHOTO_GAP_MM) + border * 2);
  return rects.map((r) => ({ x: r.x - border, y: r.y - border, w: r.w + border * 2, h: r.h + border * 2 }));
}

/**
 * ratios：写真の縦横比（並べる順）。box：置ける範囲（左下が原点）。gap：写真どうしのすき間。
 * 返す枠は ratios と同じ順。各段（列）の中は同じ高さ（幅）にそろえて、段どうしは真ん中に寄せる
 */
export function layoutPhotos(ratios: number[], box: Rect, gap: number): Rect[] {
  let best: { rects: Rect[]; score: number } | null = null;
  for (const groups of partitions(ratios.length)) {
    for (const dir of ["rows", "cols"] as const) {
      const rects = dir === "rows" ? rowsLayout(ratios, groups, box, gap) : colsLayout(ratios, groups, box, gap);
      const areas = rects.map((r) => r.w * r.h);
      const total = areas.reduce((a, b) => a + b, 0);
      // 合計の大きさを基本に、とても小さい写真ができる並べ方は下げる
      const score = total * Math.pow(Math.min(...areas) / Math.max(...areas), 0.3);
      if (!best || score > best.score) best = { rects, score };
    }
  }
  return best?.rects ?? [];
}

/** n枚を並び順のまま分ける分け方（各グループの枚数）。3枚なら [3] [1,2] [2,1] [1,1,1] */
function partitions(n: number): number[][] {
  if (n <= 0) return [];
  const out: number[][] = [];
  for (let mask = 0; mask < 1 << (n - 1); mask++) {
    const groups: number[] = [];
    let size = 1;
    for (let i = 0; i < n - 1; i++) {
      if (mask & (1 << i)) {
        groups.push(size);
        size = 1;
      } else size++;
    }
    groups.push(size);
    out.push(groups);
  }
  return out;
}

/** 横の段に並べる（段の中は同じ高さで、幅いっぱい）。高さが足りなければ全体を縮める */
function rowsLayout(ratios: number[], groups: number[], box: Rect, gap: number): Rect[] {
  const rows = slices(ratios, groups);
  const heights = rows.map((r) => (box.w - gap * (r.length - 1)) / sum(r));
  const room = box.h - gap * (rows.length - 1);
  const s = Math.min(1, room / sum(heights));
  const blockH = sum(heights) * s + gap * (rows.length - 1);
  const rects: Rect[] = [];
  let top = box.y + (box.h + blockH) / 2;
  rows.forEach((r, i) => {
    const h = heights[i] * s;
    const rowW = sum(r) * h + gap * (r.length - 1);
    let x = box.x + (box.w - rowW) / 2;
    for (const ratio of r) {
      rects.push({ x, y: top - h, w: ratio * h, h });
      x += ratio * h + gap;
    }
    top -= h + gap;
  });
  return rects;
}

/** 縦の列に並べる（列の中は同じ幅で、高さいっぱい）。左の列から */
function colsLayout(ratios: number[], groups: number[], box: Rect, gap: number): Rect[] {
  const cols = slices(ratios, groups);
  const widths = cols.map((c) => (box.h - gap * (c.length - 1)) / sum(c.map((r) => 1 / r)));
  const room = box.w - gap * (cols.length - 1);
  const s = Math.min(1, room / sum(widths));
  const blockW = sum(widths) * s + gap * (cols.length - 1);
  const rects: Rect[] = [];
  let x = box.x + (box.w - blockW) / 2;
  cols.forEach((c, i) => {
    const w = widths[i] * s;
    const colH = sum(c.map((r) => w / r)) + gap * (c.length - 1);
    let top = box.y + (box.h + colH) / 2;
    for (const ratio of c) {
      const h = w / ratio;
      rects.push({ x, y: top - h, w, h });
      top -= h + gap;
    }
    x += w + gap;
  });
  return rects;
}

const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
function slices<T>(list: T[], groups: number[]) {
  let i = 0;
  return groups.map((n) => list.slice(i, (i += n)));
}
