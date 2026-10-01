import { redirect } from "next/navigation";
import { MEMBER_MONTHLY_PREVIEWS, RETENTION } from "@/lib/catalog";
import { authKeys, currentUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Check } from "@/components/icons";
import { LoginForm } from "./form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const nextPath = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
  if (await currentUser()) redirect(nextPath);

  const perks = [
    `プレビューを月${MEMBER_MONTHLY_PREVIEWS}枚まで作れる（作り直しもOK）`,
    "写真を保存して、次の絵本にも使える",
    `作った絵本の絵を見返せる（ご注文後${RETENTION.paidImageDays}日間）`,
  ];

  return (
    <div className="shell">
      <PageHeader title="ログイン・無料会員登録" />
      <main className="step-body">
        <div className="card" style={{ gap: 12, padding: 18 }}>
          <div className="display" style={{ fontSize: 15, fontWeight: 800, color: "var(--navy)" }}>会員になるとできること</div>
          {perks.map((p) => (
            <div key={p} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, lineHeight: 1.6 }}>
              <span className="check" style={{ width: 22, height: 22, marginTop: 1 }}><Check size={13} /></span>
              {p}
            </div>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error === "expired"
              ? "ログイン用のリンクの有効期限が切れたか、すでに使われています。もう一度メールを送ってください。"
              : "ログインできませんでした。もう一度メールを送り、メールを送ったのと同じブラウザでリンクを開いてください。"}
          </p>
        )}
        {authKeys() ? (
          <LoginForm next={nextPath} />
        ) : (
          <p className="demo-note">デモモードで動いているため、ログインは使えません（Supabase の設定後に使えます）。</p>
        )}
        <p className="step-lead" style={{ fontSize: 12 }}>
          はじめての方も、同じ手順で登録できます。登録すると<a href="/privacy">プライバシーポリシー</a>に同意したものとみなします。
        </p>
      </main>
    </div>
  );
}
