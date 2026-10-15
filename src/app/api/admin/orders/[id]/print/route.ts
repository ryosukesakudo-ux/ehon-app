import { getSize, sceneText, type SizeId } from "@/lib/catalog";
import { getBook } from "@/lib/book";
import { bookTitle } from "@/lib/story-key";
import { buildCoverSpread } from "@/lib/cover-spread";
import { loadFinalImages } from "@/lib/print-assets";
import { buildBookPdfs } from "@/lib/print-pdf";
import { BOOK_BUCKET, getSupabase } from "@/lib/services";
import { bookVolume } from "@/lib/volume";
import { renderSpreadPages } from "@/lib/spread-book";

export const maxDuration = 300;

// 28ページ・コート紙マット厚め（0.14mm）なら 14枚×0.14mm ≒ 2mm
const DEFAULT_SPINE_MM = 2;

// 印刷会社に渡す入稿用PDF（本文・おもて表紙）と、製本直送.com用の見開き表紙画像（裏・背・おもて）を
// 作って保存し、ダウンロード用の一時URLを返す。全場面の本番の絵ができている注文だけ作れる。
// size を省くと注文のサイズで作る（2冊目はMサイズ）。spineMm は背幅（製本直送.comの表紙サイズ計算で確認した値）。
export async function POST(request: Request, ctx: RouteContext<"/api/admin/orders/[id]/print">) {
  const { id } = await ctx.params;
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定です" }, { status: 503 });

  const { data: order } = await db.from("orders").select("*, drafts(*)").eq("id", id).maybeSingle();
  if (!order || order.status === "pending") return Response.json({ error: "支払い済みの注文ではありません" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const size = getSize((body?.size as SizeId | undefined) ?? order.size);
  const story = getBook(order.drafts.story);
  const title = bookTitle(order.drafts.story, order.drafts.child_name);
  if (!size || !story) return Response.json({ error: "注文の内容を読み込めません" }, { status: 400 });
  const spineMm = Number(body?.spineMm ?? DEFAULT_SPINE_MM);
  if (!Number.isFinite(spineMm) || spineMm < 0 || spineMm > 30) return Response.json({ error: "背幅は0〜30mmで入れてください" }, { status: 400 });

  const loaded = await loadFinalImages(db, order.draft_id, story.scenes.length);
  if ("error" in loaded) return Response.json({ error: loaded.error }, { status: 400 });
  const { coverImage, images, spots } = loaded;

  const volume = await bookVolume(db, order);

  try {
    const texts = story.scenes.map((sc) => sceneText(sc, order.drafts.child_name));
    // 見開きの絵の場面は、塗り足し（四方3mm）込みの大きさで文を重ねて左右のページに分ける（約300dpi）
    const bleedMm = size.trimMm + 6;
    const spreadPages = await renderSpreadPages({ images, texts, spots, trimMm: bleedMm, pagePx: Math.round((bleedMm / 25.4) * 300) });
    const pdfs = await buildBookPdfs({
      title,
      childName: order.drafts.child_name,
      texts,
      images,
      spreadPages,
      coverImage,
      trimMm: size.trimMm,
      volume,
      issuedAt: new Date(),
    });
    const spread = await buildCoverSpread({
      title,
      coverImage,
      trimMm: size.trimMm,
      spineMm,
      volume,
    });
    const files = {
      body: { bytes: pdfs.body, ext: "pdf", type: "application/pdf", label: "本文" },
      cover: { bytes: pdfs.cover, ext: "pdf", type: "application/pdf", label: "表紙" },
      spread: { bytes: spread, ext: "jpg", type: "image/jpeg", label: `表紙画像_背${spineMm}mm` },
    };
    const urls: Record<string, string> = {};
    for (const [kind, file] of Object.entries(files)) {
      const path = `${order.draft_id}/print/${size.id}-${kind}.${file.ext}`;
      const { error } = await db.storage.from(BOOK_BUCKET).upload(path, file.bytes, { contentType: file.type, upsert: true });
      if (error) throw new Error(error.message);
      const name = `${order.id.slice(0, 8).toUpperCase()}_${size.id}_${file.label}.${file.ext}`;
      const { data } = await db.storage.from(BOOK_BUCKET).createSignedUrl(path, 60 * 60, { download: name });
      if (!data) throw new Error("ダウンロード用のURLを作れませんでした");
      urls[kind] = data.signedUrl;
    }
    return Response.json({ ok: true, size: size.id, urls });
  } catch (e) {
    console.error("print pdf failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "PDFを作れませんでした" }, { status: 500 });
  }
}
