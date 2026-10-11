import Link from "next/link";
import { RETENTION } from "@/lib/catalog";
import { SELLER } from "@/lib/seller";

export default function PrivacyPage() {
  const items: [string, string][] = [
    ["お預かりする情報", "会員登録に使うメールアドレス（Google でログインした場合は Google アカウントのメールアドレスと名前）、お子さま・ママ・パパのお写真、主人公のお名前とお誕生日（任意）、作成した絵（お写真から作った登場人物のキャラクターを含む）、お届け先・電話番号（決済画面で入力）。カード情報などのお支払い情報は決済サービス（Stripe）が管理し、当サービスは保持しません。"],
    ["お写真の利用目的", "お客さまの絵本の挿絵を作るためだけに使います。広告や他の目的には使いません。"],
    ["外部サービスへの提供", "挿絵の作成のため、お写真を画像生成AIのサービス（OpenAI）に送信します。データの保存には Supabase、お支払いには Stripe を利用します。"],
    ["お写真の保管と削除", `会員の方のお写真は、次の絵本でも使えるよう保管します。マイページからいつでも削除でき、最後に使ってから${RETENTION.photoIdleDays === 365 ? "1年" : `${RETENTION.photoIdleDays}日`}たったお写真は自動で削除します。会員登録前のお試しでアップロードされたお写真は、${RETENTION.anonPhotoDays}日以内に会員登録されなければ自動で削除します。`],
    ["作成した絵の保管", `ご注文いただいた絵本の絵は、お支払いから${RETENTION.paidImageDays}日間保管し、マイページでご覧いただけます。ご注文に至らなかった絵は、作成から${RETENTION.unpaidImageDays}日後に削除します。`],
    ["キャラクターの保管", `お写真から作った登場人物のキャラクターの絵は、次の絵本でも同じ姿で描けるよう、会員でいる間は保管します。マイページからいつでも削除できます。会員登録前のお試しで作ったキャラクターは、${RETENTION.anonPhotoDays}日以内に会員登録されなければ、お写真と一緒に自動で削除します。`],
    ["お誕生日の利用目的", "ご入力いただいた場合のみ、毎年お誕生日の1か月前に続編の絵本のご案内をメールでお送りするために使います。ご案内はメール内のリンクからいつでも停止できます。"],
    ["お試し回数の確認", "会員登録前のお試しを1回に限るため、ブラウザに識別用の情報（Cookie）を保存し、IPアドレスを復元できない形（ハッシュ値）で記録します。"],
    ["お問い合わせ", `${SELLER.name}（${SELLER.email}）`],
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
