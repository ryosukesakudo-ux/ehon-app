import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createAuthClient } from "@/lib/auth";
import { getAnonId } from "@/lib/anon";
import { getSupabase } from "@/lib/services";

// Google ログインやメールのリンクから戻ってくる場所。
// ログインを確定し、登録前に作ったお試しの下書きと写真を会員のものにする。
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const next = safeNext(params.get("next"));
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${reason}&next=${encodeURIComponent(next)}`, url.origin));

  const client = await createAuthClient();
  if (!client) return fail("1");
  // Supabase 側でリンクが無効だった場合（期限切れ・使用済み）
  if (params.get("error_code") === "otp_expired") return fail("expired");

  // メールのリンク：token_hash 方式なら、メールを開いたブラウザが別でもログインできる
  // （Supabase のメール文面を README の手順どおりに変えたとき）。
  // Google ログインや、文面を変えていないメールのリンクは code 方式。
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const { data, error } = tokenHash && type
    ? await client.auth.verifyOtp({ token_hash: tokenHash, type })
    : code
      ? await client.auth.exchangeCodeForSession(code)
      : { data: { user: null }, error: new Error("no code") };
  if (error || !data.user) {
    console.error("auth callback failed", error);
    const expired = error && "code" in error && error.code === "otp_expired";
    return fail(expired ? "expired" : "1");
  }
  const user = data.user;

  const db = getSupabase();
  const anonId = await getAnonId();
  if (db && anonId) {
    const { data: drafts } = await db
      .from("drafts")
      .update({ user_id: user.id })
      .eq("anon_id", anonId)
      .is("user_id", null)
      .select("child_photo_path, mom_photo_path, dad_photo_path");
    const paths = (drafts ?? []).flatMap((d) => [d.child_photo_path, d.mom_photo_path, d.dad_photo_path]).filter((p): p is string => !!p);
    if (paths.length) {
      await db
        .from("user_photos")
        .upsert(paths.map((path) => ({ user_id: user.id, path })), { onConflict: "path", ignoreDuplicates: true });
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
}
