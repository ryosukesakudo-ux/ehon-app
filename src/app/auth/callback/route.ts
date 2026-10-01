import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/auth";
import { getAnonId } from "@/lib/anon";
import { getSupabase } from "@/lib/services";

// Google ログインやメールのリンクから戻ってくる場所。
// ログインを確定し、登録前に作ったお試しの下書きと写真を会員のものにする。
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const client = await createAuthClient();
  if (!client || !code) return NextResponse.redirect(new URL("/login?error=1", url.origin));

  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("auth callback failed", error);
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(next)}`, url.origin));
  }

  const db = getSupabase();
  const anonId = await getAnonId();
  if (db && anonId) {
    const { data: drafts } = await db
      .from("drafts")
      .update({ user_id: data.user.id })
      .eq("anon_id", anonId)
      .is("user_id", null)
      .select("child_photo_path, mom_photo_path");
    const paths = (drafts ?? []).flatMap((d) => [d.child_photo_path, d.mom_photo_path]).filter((p): p is string => !!p);
    if (paths.length) {
      await db
        .from("user_photos")
        .upsert(paths.map((path) => ({ user_id: data.user.id, path })), { onConflict: "path", ignoreDuplicates: true });
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
}
