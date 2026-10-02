import Link from "next/link";

import { DELIVERY_MAX_DAYS, DELIVERY_MIN_DAYS } from "@/lib/catalog";
import { SELLER } from "@/lib/seller";

const ROWS: [string, string][] = [
  ["販売事業者", SELLER.name],
  ["運営責任者", SELLER.name],
  ["所在地", SELLER.disclose],
  ["電話番号", SELLER.disclose],
  ["メールアドレス", SELLER.email],
  ["販売価格", "各サイズの価格を、お申し込み画面に税込で表示しています"],
  ["商品代金以外の必要料金", "なし（送料は価格に含みます）"],
  ["お支払い方法", "クレジットカード（Apple Pay・Google Pay を含む）、コンビニ払いなど、お支払い画面に表示される方法"],
  ["お支払い時期", "クレジットカードなどはご注文時、コンビニ払いはお支払い期限までにお支払いください"],
  ["商品の引き渡し時期", `ご注文時に選んだお届け希望日（ご注文日の${DELIVERY_MIN_DAYS}日後〜${DELIVERY_MAX_DAYS}日後）にお届けします。希望日の指定がない場合は、ご注文日の${DELIVERY_MIN_DAYS}日後以降、準備ができしだい発送します`],
  ["返品・キャンセル", "お客様専用に制作する商品のため、ご注文後のキャンセル・返品はお受けできません。印刷や製本の不良、配送中の破損は、到着後7日以内にメールでご連絡いただければ、無料で作り直してお送りします。"],
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
