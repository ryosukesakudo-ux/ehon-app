import { getSupabase } from "@/lib/services";

// レビューの公開・非表示を切り替える。body: { id, hidden }
export async function PATCH(request: Request) {
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定です" }, { status: 503 });
  const body = await request.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) return Response.json({ error: "レビューが指定されていません" }, { status: 400 });
  const { error } = await db.from("reviews").update({ hidden: !!body?.hidden }).eq("id", id);
  if (error) return Response.json({ error: "変更に失敗しました" }, { status: 500 });
  return Response.json({ ok: true });
}
