import Link from "next/link";

// 公開前に [ ] の部分を実際の内容に置き換える
const ROWS: [string, string][] = [
  ["販売事業者", "[事業者名]"],
  ["運営責任者", "[氏名]"],
  ["所在地", "[住所]"],
  ["電話番号", "[電話番号]（お問い合わせはメールでお願いします）"],
  ["メールアドレス", "[メールアドレス]"],
  ["販売価格", "各商品ページに税込価格で表示しています"],
  ["商品代金以外の必要料金", "なし（送料は価格に含みます）"],
  ["お支払い方法", "クレジットカード"],
  ["お支払い時期", "ご注文時にお支払いが確定します"],
  ["商品の引き渡し時期", "ご注文から数日後に発送します"],
  ["返品・キャンセル", "お客様専用に制作する商品のため、ご注文後のキャンセル・返品はお受けできません。印刷や製本の不良は、到着後[7]日以内にご連絡いただければ交換します。"],
];

export default function LegalPage() {
  return (
    <main className="shell" style={{ padding: "32px 20px 48px", gap: 20 }}>
      <h1 className="display" style={{ margin: 0, fontSize: 24, color: "var(--navy)" }}>特定商取引法に基づく表記</h1>
      <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {ROWS.map(([k, v]) => (
          <div key={k} className="card" style={{ gap: 4 }}>
            <dt className="display" style={{ fontSize: 14, fontWeight: 800 }}>{k}</dt>
            <dd style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "var(--sub)" }}>{v}</dd>
          </div>
        ))}
      </dl>
      <Link href="/">トップへもどる</Link>
    </main>
  );
}
