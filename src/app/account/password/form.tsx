"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { PASSWORD_MIN } from "@/lib/password";

export function PasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < PASSWORD_MIN) return setError(`パスワードは${PASSWORD_MIN}文字以上にしてください`);
    if (password !== confirm) return setError("確認用のパスワードが一致しません");
    setBusy(true);
    const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await client.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(
        error.code === "same_password" ? "今と同じパスワードです。別のものにしてください"
        : error.code === "weak_password" ? "パスワードが簡単すぎます。もっと長く、英字と数字をまぜたものにしてください"
        : "パスワードを保存できませんでした。もう一度お試しください",
      );
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="card" style={{ padding: 18 }}>
        <div className="display" style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>パスワードを保存しました</div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>次からは、メールアドレスとこのパスワードでログインできます。</p>
        <button type="button" className="cta" onClick={() => { router.push("/account"); router.refresh(); }}>マイページへ</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="field" style={{ gap: 10 }}>
      <label htmlFor="password">新しいパスワード（{PASSWORD_MIN}文字以上）</label>
      <input id="password" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <label htmlFor="confirm">確認のため、もう一度</label>
      <input id="confirm" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="cta" disabled={busy}>{busy ? "保存しています…" : "パスワードを保存する"}</button>
    </form>
  );
}
