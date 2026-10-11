import Link from "next/link";

// ご案内メールの配信停止。メールのリンクを開いただけでは止めず（メールソフトの自動チェックで止まらないように）、ボタンで止める。
export default async function MailStopPage({ searchParams }: PageProps<"/mail/stop">) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const done = one(q.done) === "1";
  const error = one(q.error) === "1";
  return (
    <main className="shell" style={{ padding: "48px 20px", gap: 20 }}>
      <h1 className="display" style={{ margin: 0, fontSize: 22, color: "var(--navy)" }}>ご案内メールの配信停止</h1>
      {done ? (
        <p style={{ margin: 0, lineHeight: 1.8 }}>配信を停止しました。今後、お誕生日の続編のご案内はお送りしません。ご注文に関するメールは、これまでどおりお送りします。</p>
      ) : error ? (
        <p className="error" role="alert">配信停止のリンクを確認できませんでした。お手数ですが、メールにご返信いただくか、お問い合わせください。</p>
      ) : (
        <form method="post" action="/api/mail/stop" className="card" style={{ padding: 18, gap: 14 }}>
          <input type="hidden" name="u" value={one(q.u)} />
          <input type="hidden" name="t" value={one(q.t)} />
          <p style={{ margin: 0, lineHeight: 1.8 }}>お誕生日の続編のご案内メールを停止します。ご注文に関するメールは、これまでどおりお送りします。</p>
          <button type="submit">配信を停止する</button>
        </form>
      )}
      <Link href="/">トップへもどる</Link>
    </main>
  );
}
