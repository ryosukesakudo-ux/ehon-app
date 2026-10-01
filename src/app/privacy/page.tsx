import Link from "next/link";

export default function PrivacyPage() {
  const items: [string, string][] = [
    ["お預かりする情報", "お子さま・ママのお写真、主人公のお名前、お届け先・電話番号・メールアドレス（決済画面で入力）。カード情報は決済サービス（Stripe）が管理し、当サービスは保持しません。"],
    ["お写真の利用目的", "ご注文いただく絵本の挿絵を作るためだけに使います。広告や他の目的には使いません。"],
    ["外部サービスへの提供", "挿絵の作成のため、お写真を画像生成AIのサービス（OpenAI）に送信します。"],
    ["お写真の削除", "絵本の絵がすべて完成した時点で自動的に削除します。ご注文に至らなかったお写真は、アップロードから3日後に削除します。"],
    ["お問い合わせ", "[メールアドレス]"],
  ];
  return (
    <main className="shell" style={{ padding: "32px 20px 48px", gap: 20 }}>
      <h1 className="display" style={{ margin: 0, fontSize: 24, color: "var(--navy)" }}>プライバシーポリシー</h1>
      {items.map(([k, v]) => (
        <section key={k} className="card" style={{ gap: 4 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{k}</h2>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: "var(--sub)" }}>{v}</p>
        </section>
      ))}
      <Link href="/">トップへもどる</Link>
    </main>
  );
}
