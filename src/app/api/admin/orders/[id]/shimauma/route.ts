import { sceneText } from "@/lib/catalog";
import { getBook } from "@/lib/book";
import { bookTitle } from "@/lib/story-key";
import { loadFinalImages } from "@/lib/print-assets";
import { buildShimaumaZip } from "@/lib/shimauma";
import { BOOK_BUCKET, getSupabase } from "@/lib/services";
import { bookVolume } from "@/lib/volume";

export const maxDuration = 300;

// しまうまプリントのフォトブック「PICTURES」B5スクエア（182mm角）24ページ用の画像（表紙1枚＋本文23枚）を
// ZIPにまとめて保存し、ダウンロード用の一時URL（1時間有効）を返す。全場面の本番の絵ができている注文だけ作れる。
export async function POST(_request: Request, ctx: RouteContext<"/api/admin/orders/[id]/shimauma">) {
  const { id } = await ctx.params;
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定です" }, { status: 503 });

  const { data: order } = await db.from("orders").select("*, drafts(*)").eq("id", id).maybeSingle();
  if (!order || order.status === "pending") return Response.json({ error: "支払い済みの注文ではありません" }, { status: 400 });

  const story = getBook(order.drafts.story);
  if (!story) return Response.json({ error: "注文の内容を読み込めません" }, { status: 400 });

  const loaded = await loadFinalImages(db, order.draft_id, story.scenes.length);
  if ("error" in loaded) return Response.json({ error: loaded.error }, { status: 400 });

  try {
    const { zip } = await buildShimaumaZip({
      title: bookTitle(order.drafts.story, order.drafts.child_name),
      texts: story.scenes.map((sc) => sceneText(sc, order.drafts.child_name)),
      images: loaded.images,
      coverImage: loaded.coverImage,
      volume: await bookVolume(db, order),
    });
    const path = `${order.draft_id}/print/shimauma.zip`;
    const { error } = await db.storage.from(BOOK_BUCKET).upload(path, zip, { contentType: "application/zip", upsert: true });
    if (error) throw new Error(error.message);
    const name = `${order.id.slice(0, 8).toUpperCase()}_しまうま用.zip`;
    const { data } = await db.storage.from(BOOK_BUCKET).createSignedUrl(path, 60 * 60, { download: name });
    if (!data) throw new Error("ダウンロード用のURLを作れませんでした");
    return Response.json({ ok: true, url: data.signedUrl });
  } catch (e) {
    console.error("shimauma images failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "画像を作れませんでした" }, { status: 500 });
  }
}
