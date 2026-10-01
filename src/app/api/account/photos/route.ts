import { currentUser } from "@/lib/auth";
import { listPhotos } from "@/lib/account";

// 写真ページで、保存済みの写真から選べるようにする。
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  return Response.json({ photos: await listPhotos(user.id) });
}
