import { sceneText } from "@/lib/catalog";
import { getBook } from "@/lib/book";
import { bookTitle } from "@/lib/story-key";
import { loadFinalImages } from "@/lib/print-assets";
import { SHIMAUMA_PRODUCTS, buildShimaumaZip, type ShimaumaProduct } from "@/lib/shimauma";
import { BOOK_BUCKET, getSupabase } from "@/lib/services";
import { bookVolume } from "@/lib/volume";

export const maxDuration = 300;

// しまうまプリントのフォトブック用の画像（表紙＋本文）をZIPにまとめて保存し、ダウンロード用の一時URL（1時間有効）を返す。全場面の本番の絵ができている注文だけ作れる。
// product: "pictures"（PICTURES 182mm角・本文23枚）または "a5square"（通常フォトブック 148mm角・本文22枚）。省くと pictures。
export async function POST(request: Request, ctx: RouteContext<"/api/admin/orders/[id]/shimauma">) {
  const { id } = await ctx.params;
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定です" }, { status: 503 });

  const { data: order } = await db.from("orders").select("*, drafts(*)").eq("id", id).maybeSingle();
  if (!order || order.status === "pending") return Response.json({ error: "支払い済みの注文ではありません" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const product = (body?.product ?? "pictures") as ShimaumaProduct;
  if (!(product in SHIMAUMA_PRODUCTS)) return Response.json({ error: "商品の種類が正しくありません" }, { status: 400 });

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
    }, product);
    const path = `${order.draft_id}/print/shimauma-${product}.zip`;
    const { error } = await db.storage.from(BOOK_BUCKET).upload(path, zip, { contentType: "application/zip", upsert: true });
    if (error) throw new Error(error.message);
    const name = `${order.id.slice(0, 8).toUpperCase()}_しまうま_${SHIMAUMA_PRODUCTS[product].trimMm}mm.zip`;
    const { data } = await db.storage.from(BOOK_BUCKET).createSignedUrl(path, 60 * 60, { download: name });
    if (!data) throw new Error("ダウンロード用のURLを作れませんでした");
    return Response.json({ ok: true, url: data.signedUrl });
  } catch (e) {
    console.error("shimauma images failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "画像を作れませんでした" }, { status: 500 });
  }
}
