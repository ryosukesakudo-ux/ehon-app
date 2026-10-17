import Link from "next/link";
import { Check, Star } from "@/components/icons";
import { ClearFlow } from "./clear";
import { Lottie } from "@/components/lottie";
import { currentUser } from "@/lib/auth";
import { DELIVERY_NOTE } from "@/lib/catalog";
import { SELLER } from "@/lib/seller";
import { getStripe, getSupabase } from "@/lib/services";
import { syncPendingOrders } from "@/lib/order-sync";

type Shipping = { name?: string | null; address?: { postal_code?: string | null; state?: string | null; city?: string | null; line1?: string | null; line2?: string | null } | null };

// 完了画面に出すお届け先。Apple Pay・Google Pay は登録済みの住所が自動で入るため、ここで確かめてもらう。
// Stripe からの通知（webhook）がまだ届いていないこともあるので、その場合は Stripe の決済画面の記録から読む。
async function loadShipping(orderId: string): Promise<Shipping | null> {
  const db = getSupabase();
  const user = await currentUser();
  if (!db || !user || !/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const { data: o } = await db.from("orders").select("user_id, shipping, stripe_session_id").eq("id", orderId).maybeSingle();
  if (!o || o.user_id !== user.id) return null;
  // 通知（webhook）より先にこの画面が開くこともあるので、Stripe に確かめて記録しておく
  if (!o.shipping) await syncPendingOrders({ orderId });
  if (o.shipping) return o.shipping as Shipping;
  const stripe = getStripe();
  if (!stripe || !o.stripe_session_id) return null;
  const session = await stripe.checkout.sessions.retrieve(o.stripe_session_id).catch(() => null);
  return (session?.collected_information?.shipping_details as Shipping | undefined) ?? null;
}

export default async function DonePage({ searchParams }: PageProps<"/create/done">) {
  const { order } = await searchParams;
  const orderNo = typeof order === "string" ? order.slice(0, 8).toUpperCase() : "";
  const ship = typeof order === "string" ? await loadShipping(order) : null;
  const a = ship?.address;
  const steps = [
    "ご注文確認のメールが届きます（コンビニ払いの方は、お支払い後に制作を始めます）",
    "絵本を印刷・製本します",
    DELIVERY_NOTE,
  ];
  return (
    <main className="step-body" style={{ paddingTop: 40, position: "relative" }}>
      <ClearFlow />
      <Lottie name="confetti" loop={false} style={{ position: "absolute", left: "50%", top: 0, width: 360, height: 400, transform: "translateX(-50%)", zIndex: 1 }} />
      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 18, height: 56 }}>
        <Star size={22} style={{ transform: "rotate(-10deg)" }} />
        <Star size={16} color="#7CC7A8" />
        <Star size={28} color="#F4A9B8" />
        <Star size={16} color="#2F5DA8" />
        <Star size={22} style={{ transform: "rotate(12deg)" }} />
      </div>
      <div style={{ alignSelf: "center", width: 96, height: 96, borderRadius: 48, background: "var(--coral)", boxShadow: "0 6px 0 var(--coral-shadow)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Check size={44} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", textAlign: "center" }}>
        <h1 className="display" style={{ margin: 0, fontSize: 26, fontWeight: 900, color: "var(--navy)" }}>ご注文ありがとうございます</h1>
        {orderNo && <p style={{ margin: 0, fontSize: 14, color: "var(--sub)" }}>注文番号：{orderNo}</p>}
      </div>
      {a && (
        <div className="card" style={{ gap: 8, padding: 18 }}>
          <div className="display" style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>お届け先</div>
          <div style={{ fontSize: 14, lineHeight: 1.7 }}>
            〒{a.postal_code}
            <br />
            {a.state}
            {a.city}
            {a.line1}
            {a.line2 && <> {a.line2}</>}
            <br />
            {ship?.name} 様
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: "var(--sub)" }}>
            Apple Pay・Google Pay でお支払いの方は、登録済みの住所が使われています。お届け先が違う場合は、ご注文確認メールにご返信いただくか、{SELLER.email} まで注文番号を添えてご連絡ください。
          </p>
        </div>
      )}
      <div className="card" style={{ gap: 14, padding: 18 }}>
        <div className="display" style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>このあとの流れ</div>
        {steps.map((t, i) => (
          <div key={t} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div className="display" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 13, background: "var(--yellow)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900 }}>
              {i + 1}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.7 }}>{t}</div>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: "var(--sub)", textAlign: "center" }}>
        ご注文の状況と絵本の絵は、マイページでご確認いただけます。写真はマイページからいつでも削除できます。
      </p>
      <Link href="/account" className="cta">マイページを見る</Link>
      <Link href="/" className="ghost" style={{ height: 56, borderColor: "var(--coral)", color: "var(--coral)", fontSize: 17 }}>
        トップへもどる
      </Link>
    </main>
  );
}
