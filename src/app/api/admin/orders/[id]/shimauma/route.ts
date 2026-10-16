import type { SupabaseClient } from "@supabase/supabase-js";
import { PERSON_LABEL, calledName, sceneText } from "@/lib/catalog";
import { loadBookExtras } from "@/lib/book-extras";
import { parseCustomKey } from "@/lib/custom-story";
import { draftGuestCount, draftPeople, guestCharacterPath, type Draft } from "@/lib/drafts";
import { getBook } from "@/lib/book";
import { bookTitle, parseSeriesKey } from "@/lib/story-key";
import { loadFinalImages } from "@/lib/print-assets";
import { SHIMAUMA_PRODUCTS, buildShimaumaZip, type ShimaumaExtras, type ShimaumaProduct } from "@/lib/shimauma";
import { SERIES_DATA } from "@/lib/series-data";
import { seriesSidekickPath, sidekickShortName } from "@/lib/series";
import { BOOK_BUCKET, PHOTO_BUCKET, SAMPLE_BUCKET, getSupabase } from "@/lib/services";
import { bookVolume } from "@/lib/volume";
import { SHIMAUMA_SEAM_OVERLAP, renderSpreadPages } from "@/lib/spread-book";

export const maxDuration = 300;

// しまうまプリントのフォトブック用の画像（表紙＋本文）をZIPにまとめて保存し、ダウンロード用の一時URL（1時間有効）を返す。全場面の本番の絵ができている注文だけ作れる。
// product: "a5square36"（通常フォトブック 148mm角 36ページ・本文34枚。いま売っている本）、"a5square"（同 24ページ・本文22枚）、
// "pictures"（PICTURES 182mm角・本文23枚）。省くと a5square36。36ページは特別ページ（登場人物しょうかい・思い出の写真など）も入る。
export async function POST(request: Request, ctx: RouteContext<"/api/admin/orders/[id]/shimauma">) {
  const { id } = await ctx.params;
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定です" }, { status: 503 });

  const { data: order } = await db.from("orders").select("*, drafts(*)").eq("id", id).maybeSingle();
  if (!order || order.status === "pending") return Response.json({ error: "支払い済みの注文ではありません" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const product = (body?.product ?? "a5square36") as ShimaumaProduct;
  if (!(product in SHIMAUMA_PRODUCTS)) return Response.json({ error: "商品の種類が正しくありません" }, { status: 400 });

  const story = getBook(order.drafts.story);
  if (!story) return Response.json({ error: "注文の内容を読み込めません" }, { status: 400 });

  const loaded = await loadFinalImages(db, order.draft_id, story.scenes.length);
  if ("error" in loaded) return Response.json({ error: loaded.error }, { status: 400 });

  try {
    const serial = await orderSerial(db, order);
    const texts = story.scenes.map((sc) => sceneText(sc, order.drafts.child_name));
    const { trimMm, pagePx } = SHIMAUMA_PRODUCTS[product];
    const { zip } = await buildShimaumaZip({
      title: bookTitle(order.drafts.story, order.drafts.child_name),
      texts,
      images: loaded.images,
      // 見開きの絵の場面は、文を重ねて左右のページに分ける
      spreadPages: await renderSpreadPages({ images: loaded.images, texts, spots: loaded.spots, trimMm, pagePx, seamOverlap: Math.round(pagePx * SHIMAUMA_SEAM_OVERLAP) }),
      coverImage: loaded.coverImage,
      volume: await bookVolume(db, order),
      serial,
      extras: "extras" in SHIMAUMA_PRODUCTS[product] ? await loadExtras(db, order, serial) : undefined,
    }, product);
    const path = `${order.draft_id}/print/shimauma-${product}.zip`;
    const { error } = await db.storage.from(BOOK_BUCKET).upload(path, zip, { contentType: "application/zip", upsert: true });
    if (error) throw new Error(error.message);
    const name = `No${String(serial).padStart(4, "0")}_しまうま_${SHIMAUMA_PRODUCTS[product].trimMm}mm.zip`;
    const { data } = await db.storage.from(BOOK_BUCKET).createSignedUrl(path, 60 * 60, { download: name });
    if (!data) throw new Error("ダウンロード用のURLを作れませんでした");
    return Response.json({ ok: true, url: data.signedUrl });
  } catch (e) {
    console.error("shimauma images failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "画像を作れませんでした" }, { status: 500 });
  }
}

type OrderRow = { id: string; draft_id: string; paid_at: string | null; created_at: string; child_birthday?: string | null; drafts: Draft };

/** 通し番号：お支払いが済んだ順（この注文より前に支払われた注文の数＋1） */
async function orderSerial(db: SupabaseClient, order: OrderRow) {
  const paidAt = order.paid_at ?? order.created_at;
  const { count } = await db.from("orders").select("id", { count: "exact", head: true }).not("paid_at", "is", null).lte("paid_at", paidAt);
  return Math.max(1, count ?? 1);
}

/** 特別ページの内容を集める（呼び方・メッセージ・思い出の写真・登場人物の絵・通し番号） */
async function loadExtras(db: SupabaseClient, order: OrderRow, serial: number): Promise<ShimaumaExtras> {
  const draft = order.drafts;
  const saved = await loadBookExtras(db, order.draft_id, order.id);
  const called = calledName(draft.child_name, saved.honorific);
  const download = async (bucket: string, path: string | null | undefined) => {
    if (!path) return null;
    const { data } = await db.storage.from(bucket).download(path);
    return data ? Buffer.from(await data.arrayBuffer()) : null;
  };

  // 登場人物：主人公・ママ・パパ（キャラクターの絵がある人）、オリジナルのお話のほかの登場人物、台本のお話の相棒
  const characters: ShimaumaExtras["characters"] = [];
  for (const who of draftPeople(draft)) {
    const image = await download(BOOK_BUCKET, draft[`${who}_character_path`]);
    if (image) characters.push({ name: who === "child" ? called : PERSON_LABEL[who], image });
  }
  const cast = parseCustomKey(draft.story)?.cast ?? [];
  for (let i = 0; i < draftGuestCount(draft); i++) {
    const image = await download(BOOK_BUCKET, guestCharacterPath(draft.id, i));
    if (image) characters.push({ name: cast[i]?.name ?? `とうじょうじんぶつ${i + 1}`, image });
  }

  // 相棒（森ならりすのポッケ）は絵スタジオで作ったシリーズ共通の絵（公開の samples）。無ければ載せない
  const k = parseSeriesKey(draft.story);
  const data = k ? SERIES_DATA[k.series] : null;
  if (k && data) {
    const image = await download(SAMPLE_BUCKET, seriesSidekickPath(k.series));
    if (image) characters.push({ name: sidekickShortName(data.sidekickLabel), image });
  }

  // 思い出の写真（アップした順）。読めなかった写真は飛ばす
  const memoryPhotos: Buffer[] = [];
  for (const path of saved.memoryPhotoPaths) {
    const image = await download(PHOTO_BUCKET, path);
    if (image) memoryPhotos.push(image);
  }

  return {
    called,
    message: saved.message,
    memoryPhotos,
    serial,
    characters,
  };
}
