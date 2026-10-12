import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { COVER_SCENE } from "@/lib/catalog";
import { BOOK_BUCKET } from "@/lib/services";

// 印刷用のデータ（入稿用PDF・しまうま用の画像）を作るために、注文の本番の絵（表紙と全場面）を読み込む。
// まだ無い絵があるときは、管理画面に出すメッセージを error に入れて返す。
export async function loadFinalImages(db: SupabaseClient, draftId: string, sceneCount: number) {
  const { data: coverData } = await db.storage.from(BOOK_BUCKET).download(`${draftId}/final/${COVER_SCENE}.png`);
  if (!coverData) return { error: "表紙の本番の絵がまだありません。先に「全ページの絵を作る」を押してください" } as const;
  const coverImage = Buffer.from(await coverData.arrayBuffer());

  const images: Buffer[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const { data } = await db.storage.from(BOOK_BUCKET).download(`${draftId}/final/${String(i).padStart(2, "0")}.png`);
    if (!data) return { error: `場面${i + 1}の本番の絵がまだありません。先に「全ページの絵を作る」を押してください` } as const;
    images.push(Buffer.from(await data.arrayBuffer()));
  }
  return { coverImage, images };
}
