"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

function client() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function google() {
    setError(null);
    const { error } = await client().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback() } });
    if (error) setError("Google でのログインを開始できませんでした");
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const { error } = await client().auth.signInWithOtp({ email, options: { emailRedirectTo: callback() } });
    if (error) {
      setError("メールを送れませんでした。アドレスを確認してもう一度お試しください");
      setState("idle");
    } else {
      setState("sent");
    }
  }

  return (
    <>
      <button type="button" className="ghost" onClick={google} style={{ height: 56, gap: 10, borderColor: "#d9cfbd", color: "var(--ink)", fontSize: 16 }}>
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
      {state === "sent" ? (
        <div className="card" style={{ padding: 18 }}>
          <div className="display" style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>メールを送りました</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
            {email} に届いたメールのリンクを開くと、ログインできます。届かないときは迷惑メールフォルダもご確認ください。
          </p>
        </div>
      ) : (
        <form onSubmit={sendLink} className="field" style={{ gap: 10 }}>
          <label htmlFor="email" className="display">メールアドレスでつづける</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="example@mail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ height: 48, padding: "0 14px", borderRadius: 14, border: "2px solid #d9cfbd", background: "#fff", fontSize: 16 }}
          />
          <button type="submit" className="cta" disabled={state === "sending"}>
            {state === "sending" ? "送信中…" : "ログイン用のリンクを送る"}
          </button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
