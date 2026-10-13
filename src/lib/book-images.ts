import "server-only";
import sharp from "sharp";
import { BOOK_BUCKET, getSupabase } from "./services";

// 絵本の絵（books）は印刷・AIの参考用に大きな PNG で保存している（1枚 1.5〜6MB）。
// 画面にそのまま出すと Supabase の送信量（無料枠は月5GB）をすぐ使い切るため、
// 保存するときに表示用の軽い WebP（1枚 100〜250KB）を隣に置き、画面ではそちらを出す。
// 印刷・AIに渡す絵は今までどおり PNG を使う。

/** 表示用の絵の大きさ（長い辺）。プレビューの絵（1024px）と同じなので、画面での見た目は変わらない */
const VIEW_PX = 1024;

/** PNG の保存先に対応する、表示用の絵の保存先（例：xxx/preview/03.png → xxx/preview/03.view.webp） */
export function viewPathOf(path: string) {
  return path.replace(/\.png$/, ".view.webp");
}

/** 表示用の絵か（フォルダの一覧から PNG だけを拾うとき用） */
export function isViewPath(path: string) {
  return path.endsWith(".view.webp");
}

async function toViewImage(png: Buffer) {
  return sharp(png)
    .resize({ width: VIEW_PX, height: VIEW_PX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
}

/** 絵（PNG）を保存し、表示用の軽い絵も一緒に保存する。表示用の保存に失敗しても、元の絵は保存できていれば続ける */
export async function uploadBookImage(path: string, png: Buffer) {
  const db = getSupabase()!;
  const { error } = await db.storage.from(BOOK_BUCKET).upload(path, png, { contentType: "image/png", upsert: true });
  if (error) return { error };
  await saveView(path, png);
  return { error: null };
}

async function saveView(path: string, png: Buffer) {
  const db = getSupabase()!;
  try {
    const { error } = await db.storage
      .from(BOOK_BUCKET)
      .upload(viewPathOf(path), await toViewImage(png), { contentType: "image/webp", upsert: true });
    if (error) console.error("view image save failed", path, error);
  } catch (e) {
    console.error("view image save failed", path, e);
  }
}

/** 保存先をコピーするとき、表示用の絵も一緒にコピーする（表示用が無い古い絵なら、コピー先で作る） */
export async function copyBookImage(from: string, to: string) {
  const db = getSupabase()!;
  const { error } = await db.storage.from(BOOK_BUCKET).copy(from, to);
  if (error) return { error };
  const { error: viewError } = await db.storage.from(BOOK_BUCKET).copy(viewPathOf(from), viewPathOf(to));
  if (viewError) {
    const { data } = await db.storage.from(BOOK_BUCKET).download(from);
    if (data) await saveView(to, Buffer.from(await data.arrayBuffer()));
  }
  return { error: null };
}

/** 絵を消すときは、表示用の絵も一緒に消す */
export function withViews(paths: string[]) {
  return paths.flatMap((p) => (isViewPath(p) ? [p] : [p, viewPathOf(p)]));
}

/**
 * 画面に出す一時URL（PNG の保存先 → URL）。表示用の軽い絵があればそちら、
 * まだ無い古い絵は元の PNG のURLにする。
 */
export async function viewUrls(paths: string[], expiresIn = 60 * 60): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const db = getSupabase();
  if (!db || !paths.length) return out;
  const { data: views } = await db.storage.from(BOOK_BUCKET).createSignedUrls(paths.map(viewPathOf), expiresIn);
  const missing: string[] = [];
  paths.forEach((p, i) => {
    const v = views?.[i];
    if (v && !v.error && v.signedUrl) out.set(p, v.signedUrl);
    else missing.push(p);
  });
  if (missing.length) {
    const { data: originals } = await db.storage.from(BOOK_BUCKET).createSignedUrls(missing, expiresIn);
    missing.forEach((p, i) => {
      const u = originals?.[i];
      if (u && !u.error && u.signedUrl) out.set(p, u.signedUrl);
    });
  }
  return out;
}

/** 1枚分の表示用の一時URL */
export async function viewUrl(path: string) {
  const url = (await viewUrls([path])).get(path);
  if (!url) throw new Error("画像URLの作成に失敗しました");
  return url;
}
