import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { COVER_SCENE } from "@/lib/catalog";
import { BOOK_BUCKET } from "@/lib/services";
import type { SpreadTextSpot } from "@/lib/series";
import { isWideImage, parseSceneSpot, sceneSpotPath, sceneTextSide } from "@/lib/spread-scene";

// 印刷用のデータ（入稿用PDF・しまうま用の画像）を作るために、注文の本番の絵（表紙と全場面）を読み込む。
// まだ無い絵があるときは、管理画面に出すメッセージを error に入れて返す。
// spots：見開きの絵（横長）の場面は文の置き場所、正方形の絵（見開きに切り替える前の絵）の場面は null
export async function loadFinalImages(db: SupabaseClient, draftId: string, sceneCount: number) {
  const { data: coverData } = await db.storage.from(BOOK_BUCKET).download(`${draftId}/final/${COVER_SCENE}.png`);
  if (!coverData) return { error: "表紙の本番の絵がまだありません。先に「全ページの絵を作る」を押してください" } as const;
  const coverImage = Buffer.from(await coverData.arrayBuffer());

  const images: Buffer[] = [];
  const spots: (SpreadTextSpot | null)[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const path = `${draftId}/final/${String(i).padStart(2, "0")}.png`;
    const { data } = await db.storage.from(BOOK_BUCKET).download(path);
    if (!data) return { error: `場面${i + 1}の本番の絵がまだありません。先に「全ページの絵を作る」を押してください` } as const;
    const image = Buffer.from(await data.arrayBuffer());
    images.push(image);
    if (!(await isWideImage(image))) {
      spots.push(null);
      continue;
    }
    const { data: json } = await db.storage.from(BOOK_BUCKET).download(sceneSpotPath(path));
    spots.push(parseSceneSpot(json ? await json.text() : null, sceneTextSide(i)));
  }
  return { coverImage, images, spots };
}
