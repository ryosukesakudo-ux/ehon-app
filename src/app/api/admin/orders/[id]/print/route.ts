import { COVER_SCENE, getSize, getStory, sceneText, type SizeId } from "@/lib/catalog";
import { buildCoverSpread } from "@/lib/cover-spread";
import { buildBookPdfs } from "@/lib/print-pdf";
import { BOOK_BUCKET, getSupabase } from "@/lib/services";

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
  const story = getStory(order.drafts.story);
  if (!size || !story) return Response.json({ error: "注文の内容を読み込めません" }, { status: 400 });
  const spineMm = Number(body?.spineMm ?? DEFAULT_SPINE_MM);
  if (!Number.isFinite(spineMm) || spineMm < 0 || spineMm > 30) return Response.json({ error: "背幅は0〜30mmで入れてください" }, { status: 400 });

  const { data: coverData } = await db.storage.from(BOOK_BUCKET).download(`${order.draft_id}/final/${COVER_SCENE}.png`);
  if (!coverData) return Response.json({ error: "表紙の本番の絵がまだありません。先に「全ページの絵を作る」を押してください" }, { status: 400 });
  const coverImage = Buffer.from(await coverData.arrayBuffer());

  const images: Buffer[] = [];
  for (let i = 0; i < story.scenes.length; i++) {
    const { data } = await db.storage.from(BOOK_BUCKET).download(`${order.draft_id}/final/${String(i).padStart(2, "0")}.png`);
    if (!data) return Response.json({ error: `場面${i + 1}の本番の絵がまだありません。先に「全ページの絵を作る」を押してください` }, { status: 400 });
    images.push(Buffer.from(await data.arrayBuffer()));
  }

  try {
    const pdfs = await buildBookPdfs({
      storyName: story.name,
      childName: order.drafts.child_name,
      texts: story.scenes.map((sc) => sceneText(sc, order.drafts.child_name)),
      images,
      coverImage,
      trimMm: size.trimMm,
      issuedAt: new Date(),
    });
    const spread = await buildCoverSpread({
      storyName: story.name,
      childName: order.drafts.child_name,
      coverImage,
      trimMm: size.trimMm,
      spineMm,
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
