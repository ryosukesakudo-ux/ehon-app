"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { PASSWORD_MIN } from "@/lib/password";
import { hasProgress, readLocalFlow } from "../create/flow-storage";

function client() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

type Mode = "login" | "signup" | "reset";
// メールを送ったあとの案内
type Sent = { kind: "signup" | "reset"; email: string } | null;

const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: "メールアドレスかパスワードが違います",
  email_not_confirmed: "登録の確認がまだ済んでいません。届いたメールのリンクを開いてください",
  weak_password: "パスワードが簡単すぎます。もっと長く、英字と数字をまぜたものにしてください",
  over_email_send_rate_limit: "メールの送信が続いたため、少し時間をおいてからお試しください",
  over_request_rate_limit: "操作が続いたため、少し時間をおいてからお試しください",
};

function message(error: { code?: string } | null, fallback: string) {
  return (error?.code && AUTH_ERRORS[error.code]) || fallback;
}

export function LoginForm({ next, google }: { next: string; google: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent>(null);
  const [error, setError] = useState<string | null>(null);
  const callback = (to = next) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(to)}`;

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
  }

  async function signInGoogle() {
    setError(null);
    const { error } = await client().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback() } });
    if (error) setError("Google でのログインを開始できませんでした");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const auth = client().auth;
    try {
      if (mode === "login") {
        const { error } = await auth.signInWithPassword({ email, password });
        if (error) throw message(error, "ログインできませんでした。もう一度お試しください");
        // 登録前のお試しで作ったものを会員のものにする
        await fetch("/api/auth/claim", { method: "POST" }).catch(() => {});
        router.replace(next);
        router.refresh();
        return;
      }
      if (mode === "signup") {
        if (password.length < PASSWORD_MIN) throw `パスワードは${PASSWORD_MIN}文字以上にしてください`;
        // 作りかけの内容をアカウントに引き継ぐ（確認メールを別のブラウザで開いても続きから作れるように）
        const local = readLocalFlow();
        const flowSave = hasProgress(local) ? { ...local, savedAt: new Date().toISOString() } : undefined;
        const { data, error } = await auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callback(), data: flowSave ? { flow_save: flowSave } : undefined },
        });
        if (error) throw message(error, "登録できませんでした。もう一度お試しください");
        // すでに登録済みのアドレスは、identities が空で返ってくる
        if (data.user && data.user.identities?.length === 0) {
          setMode("login");
          throw "このメールアドレスは登録済みです。パスワードでログインしてください";
        }
        if (data.session) {
          // 確認メールなしの設定のとき
          await fetch("/api/auth/claim", { method: "POST" }).catch(() => {});
          router.replace(next);
          router.refresh();
          return;
        }
        setSent({ kind: "signup", email });
      } else {
        // 再設定メールは、受け取ったスマホのメールアプリなど別のブラウザで開かれることが多い。
        // ふつうの方式（PKCE）は申し込んだのと同じブラウザでしか開けないため、ここだけ別の方式で送る。
        const implicit = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
          auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        const { error } = await implicit.auth.resetPasswordForEmail(email, { redirectTo: callback("/reset-password") });
        if (error) throw message(error, "メールを送れませんでした。アドレスを確認してもう一度お試しください");
        setSent({ kind: "reset", email });
      }
    } catch (e) {
      setError(typeof e === "string" ? e : "うまくいきませんでした。もう一度お試しください");
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="card" style={{ padding: 18 }}>
        <div className="display" style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>メールを送りました</div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
          {sent.kind === "signup"
            ? `${sent.email} に届いたメールのリンクを開くと、登録が完了します。次からはメールアドレスとパスワードでログインできます。`
            : `${sent.email} に届いたメールのリンクを開き、新しいパスワードを決めてください。`}
          届かないときは迷惑メールフォルダもご確認ください。
        </p>
        <button type="button" className="ghost" onClick={() => { setSent(null); switchMode("login"); }}>
          ログイン画面にもどる
        </button>
      </div>
    );
  }

  const title = { login: "メールアドレスでログイン", signup: "メールアドレスで新規登録", reset: "パスワードの再設定" }[mode];
  const button = { login: "ログイン", signup: "登録する（確認メールが届きます）", reset: "再設定のメールを送る" }[mode];

  return (
    <>
      {google && mode !== "reset" && (
        <>
          <button type="button" className="ghost" onClick={signInGoogle} style={{ height: 56, gap: 10, borderColor: "#d9cfbd", color: "var(--ink)", fontSize: 16 }}>
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
            </svg>
            Google でつづける
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--sub)" }}>
            <span className="divider" style={{ flex: 1 }} />または<span className="divider" style={{ flex: 1 }} />
          </div>
        </>
      )}
      <form onSubmit={submit} className="field" style={{ gap: 10 }}>
        <div className="display" style={{ fontSize: 15, fontWeight: 800, color: "var(--navy)" }}>{title}</div>
        <label htmlFor="email">メールアドレス</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="example@mail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {mode !== "reset" && (
          <>
            <label htmlFor="password">パスワード{mode === "signup" ? `（${PASSWORD_MIN}文字以上）` : ""}</label>
            <input
              id="password"
              type="password"
              required
              minLength={mode === "signup" ? PASSWORD_MIN : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}
        {mode === "reset" && (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--sub)" }}>
            パスワードを決めるためのリンクをメールで送ります。メールのリンクだけでログインしていた方も、ここからパスワードを決められます。
          </p>
        )}
        <button type="submit" className="cta" disabled={busy}>
          {busy ? "お待ちください…" : button}
        </button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", fontSize: 14 }}>
        {mode !== "signup" && (
          <button type="button" className="link-button" onClick={() => switchMode("signup")}>はじめての方は、こちらから新規登録</button>
        )}
        {mode !== "login" && (
          <button type="button" className="link-button" onClick={() => switchMode("login")}>登録済みの方は、こちらからログイン</button>
        )}
        {mode === "login" && (
          <button type="button" className="link-button" onClick={() => switchMode("reset")}>パスワードを忘れた方・まだ決めていない方</button>
        )}
      </div>
    </>
  );
}
