import { currentUser } from "@/lib/auth";
import { deletePhoto } from "@/lib/account";

// 会員ページの「この写真を削除」
export async function DELETE(_request: Request, ctx: RouteContext<"/api/account/photos/[id]">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const result = await deletePhoto(user.id, id);
  if ("error" in result) return Response.json(result, { status: 400 });
  return Response.json(result);
}
