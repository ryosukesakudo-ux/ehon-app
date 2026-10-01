"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { PageHeader } from "@/components/page-header";
import { PasswordForm } from "../account/password/form";

// パスワード再設定メールのリンクから来る画面。
// URL の # 以降に付いてくるログイン情報でログインしてから、新しいパスワードを決めてもらう。
export default function ResetPasswordPage() {
  const [state, setState] = useState<"loading" | "ready" | "invalid">("loading");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    (async () => {
      if (access_token && refresh_token) {
        await client.auth.setSession({ access_token, refresh_token });
        // ログイン情報をアドレス欄に残さない
        history.replaceState(null, "", window.location.pathname);
      }
      const { data } = await client.auth.getUser();
      setEmail(data.user?.email ?? null);
      setState(data.user ? "ready" : "invalid");
    })();
  }, []);

  return (
    <div className="shell">
      <PageHeader title="パスワードの再設定" />
      <main className="step-body">
        {state === "loading" && <p className="step-lead">確認しています…</p>}
        {state === "ready" && (
          <>
            <p className="step-lead">{email} の新しいパスワードを決めてください。</p>
            <PasswordForm />
          </>
        )}
        {state === "invalid" && (
          <>
            <p className="error" role="alert">
              再設定用のリンクの有効期限が切れたか、すでに使われています。お手数ですが、もう一度メールを送ってください。
            </p>
            <a href="/login" className="cta">ログイン画面へ</a>
          </>
        )}
      </main>
    </div>
  );
}
