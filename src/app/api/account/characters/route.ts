import { currentUser } from "@/lib/auth";
import { listCharacters } from "@/lib/account";

// 写真ページで、前に作ったキャラクターから選べるようにする。
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  return Response.json({ characters: await listCharacters(user.id) });
}
