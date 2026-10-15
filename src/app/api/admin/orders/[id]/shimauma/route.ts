import type { SupabaseClient } from "@supabase/supabase-js";
import { PERSON_LABEL, calledName, sceneText } from "@/lib/catalog";
import { loadBookExtras } from "@/lib/book-extras";
import { parseCustomKey } from "@/lib/custom-story";
import { draftGuestCount, draftPeople, guestCharacterPath, type Draft } from "@/lib/drafts";
import { getBook } from "@/lib/book";
import { bookTitle, getSeriesInfo, openEpisodes, parseSeriesKey } from "@/lib/story-key";
import { loadFinalImages } from "@/lib/print-assets";
import { SHIMAUMA_PRODUCTS, buildShimaumaZip, type ShimaumaExtras, type ShimaumaProduct } from "@/lib/shimauma";
import { BOOK_BUCKET, PHOTO_BUCKET, getSupabase } from "@/lib/services";
import { bookVolume } from "@/lib/volume";

export const maxDuration = 300;

// しまうまプリントのフォトブック用の画像（表紙＋本文）をZIPにまとめて保存し、ダウンロード用の一時URL（1時間有効）を返す。全場面の本番の絵ができている注文だけ作れる。
// product: "a5square36"（通常フォトブック 148mm角 36ページ・本文34枚。いま売っている本）、"a5square"（同 24ページ・本文22枚）、
// "pictures"（PICTURES 182mm角・本文23枚）。省くと a5square36。36ページは特別ページ（献辞・登場人物しょうかいなど）も入る。
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
    const { zip } = await buildShimaumaZip({
      title: bookTitle(order.drafts.story, order.drafts.child_name),
      texts: story.scenes.map((sc) => sceneText(sc, order.drafts.child_name)),
      images: loaded.images,
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

/** 特別ページの内容を集める（呼び方・メッセージ・思い出の写真・登場人物の絵・通し番号・次のお話） */
/** 通し番号：お支払いが済んだ順（この注文より前に支払われた注文の数＋1） */
async function orderSerial(db: SupabaseClient, order: OrderRow) {
  const paidAt = order.paid_at ?? order.created_at;
  const { count } = await db.from("orders").select("id", { count: "exact", head: true }).not("paid_at", "is", null).lte("paid_at", paidAt);
  return Math.max(1, count ?? 1);
}

async function loadExtras(db: SupabaseClient, order: OrderRow, serial: number): Promise<ShimaumaExtras> {
  const draft = order.drafts;
  const saved = await loadBookExtras(db, order.draft_id, order.id);
  const called = calledName(draft.child_name, saved.honorific);
  const download = async (bucket: string, path: string | null | undefined) => {
    if (!path) return null;
    const { data } = await db.storage.from(bucket).download(path);
    return data ? Buffer.from(await data.arrayBuffer()) : null;
  };

  // 登場人物：主人公・ママ・パパ（キャラクターの絵がある人）、オリジナルのお話のほかの登場人物
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

  const paidAt = order.paid_at ?? order.created_at;

  // 次のお話：シリーズの次の話（公開中の話だけ）。オリジナルのお話や最後の話は無し
  const k = parseSeriesKey(draft.story);
  const series = k ? getSeriesInfo(k.series) : null;
  const next = k && series ? openEpisodes(series.episodes).find((e) => e.no === k.episode + 1) : null;

  return {
    called,
    childName: draft.child_name,
    childAge: draft.child_age,
    birthday: order.child_birthday ?? null,
    madeAt: new Date(paidAt),
    message: saved.message,
    memoryPhoto: await download(PHOTO_BUCKET, saved.memoryPhotoPath),
    serial,
    characters,
    nextEpisode: next && series ? { lead: `${series.name} 第${next.no}話`, title: next.title } : null,
  };
}
