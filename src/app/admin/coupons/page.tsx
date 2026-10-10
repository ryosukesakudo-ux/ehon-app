import { yen } from "@/lib/catalog";
import { getSupabase } from "@/lib/services";
import { CouponForm, CouponToggle } from "./forms";

export const dynamic = "force-dynamic";

export default async function CouponsPage() {
  const db = getSupabase();
  if (!db) return <main style={{ padding: 24 }}>Supabase が未設定です（デモモード）。</main>;
  const [{ data: coupons, error }, { data: used }] = await Promise.all([
    db.from("coupons").select("*").order("created_at", { ascending: false }),
    db.from("orders").select("coupon_code").not("coupon_code", "is", null).not("paid_at", "is", null),
  ]);
  if (error) {
    return (
      <main style={{ padding: 24 }}>
        クーポンの表がまだありません。Supabase の SQL Editor で schema.sql を実行してください。
      </main>
    );
  }
  const count = (code: string) => (used ?? []).filter((o) => o.coupon_code === code).length;

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <a href="/admin">← 注文管理へ</a>
      <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>クーポン管理</h1>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8 }}>
        クーポンは1冊目の値段を変えます（0円なら無料）。2冊目以降は通常の値段です。おひとり様1回まで、人数の上限はありません。
      </p>
      <CouponForm />
      <table style={{ borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)" }}>
            <th style={{ padding: 8 }}>コード</th>
            <th style={{ padding: 8 }}>名前</th>
            <th style={{ padding: 8 }}>1冊目の値段</th>
            <th style={{ padding: 8 }}>使われた回数</th>
            <th style={{ padding: 8 }}>状態</th>
          </tr>
        </thead>
        <tbody>
          {(coupons ?? []).map((c) => (
            <tr key={c.code} style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ padding: 8, fontFamily: "monospace", fontSize: 15 }}>{c.code}</td>
              <td style={{ padding: 8 }}>{c.label}</td>
              <td style={{ padding: 8 }}>{c.book_price === 0 ? "無料" : yen(c.book_price)}</td>
              <td style={{ padding: 8 }}>{count(c.code)}回</td>
              <td style={{ padding: 8 }}><CouponToggle code={c.code} active={c.active} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!coupons?.length && <p>まだクーポンはありません。</p>}
    </main>
  );
}
