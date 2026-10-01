import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createAuthClient } from "@/lib/auth";
import { claimAnonData } from "@/lib/claim";

// Google ログインやメールのリンク（登録の確認・パスワードの再設定）から戻ってくる場所。
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
  // Google ログインの失敗（Supabase の Client ID・Secret の設定違いなど）。理由は画面にも出して設定の確認に使う。
  const providerError = params.get("error_description") ?? params.get("error");
  if (providerError) {
    console.error("auth provider error", providerError);
    return NextResponse.redirect(
      new URL(`/login?error=provider&reason=${encodeURIComponent(providerError.slice(0, 200))}&next=${encodeURIComponent(next)}`, url.origin),
    );
  }

  // メールのリンク：token_hash 方式なら、メールを開いたブラウザが別でもログインできる
  // （Supabase のメール文面を README の手順どおりに変えたとき）。
  // Google ログインや、文面を変えていないメールのリンクは code 方式。
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  // パスワード再設定メール：ログイン情報は URL の # 以降に付いてきてサーバーには届かない。
  // # 以降はリダイレクト先にも引き継がれるので、そのまま再設定の画面へ渡す。
  if (!tokenHash && !code && next === "/reset-password") return NextResponse.redirect(new URL(next, url.origin));
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

  await claimAnonData(user.id);

  return NextResponse.redirect(new URL(next, url.origin));
}

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
}
