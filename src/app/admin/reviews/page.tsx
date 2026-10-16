import { REVIEW_COUPON, yen } from "@/lib/catalog";
import { getSupabase } from "@/lib/services";
import { samplePublicUrl } from "@/lib/samples";
import { storyLabel } from "@/lib/story-key";
import { Stars } from "@/components/review-card";
import { ReviewToggle } from "./toggle";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  nickname: string;
  rating: number;
  body: string;
  photo_path: string | null;
  hidden: boolean;
  coupon_code: string;
  created_at: string;
  order_id: string;
  orders: { drafts: { story: string; child_name: string } | null } | null;
};

// レビュー管理：投稿はすぐ公開されるので、ここで内容を見て、問題があれば非表示にする
export default async function AdminReviewsPage() {
  const db = getSupabase();
  if (!db) return <main style={{ padding: 24 }}>Supabase が未設定です（デモモード）。</main>;
  const [{ data, error }, { data: used }] = await Promise.all([
    db.from("reviews").select("*, orders(drafts(story, child_name))").order("created_at", { ascending: false }).limit(200),
    db.from("orders").select("coupon_code").like("coupon_code", `${REVIEW_COUPON.prefix}%`).not("paid_at", "is", null),
  ]);
  if (error) {
    return <main style={{ padding: 24 }}>レビューの表がまだありません。Supabase の SQL Editor で reviews.sql（または schema.sql）を実行してください。</main>;
  }
  const rows = (data ?? []) as unknown as Row[];
  const usedCodes = new Set((used ?? []).map((o) => o.coupon_code));

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 16 }}>
      <a href="/admin">← 注文管理へ</a>
      <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>レビュー管理</h1>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8 }}>
        投稿はすぐサイトに公開されます。問題のあるものは「非表示にする」で隠せます。お礼のクーポン（{yen(REVIEW_COUPON.discount)}引き・本人だけ1回）は投稿時に発行済みです。
        <br />
        公開中 {rows.filter((r) => !r.hidden).length}件／全部で {rows.length}件・クーポン使用 {usedCodes.size}件
      </p>
      {rows.length === 0 && <p>まだレビューはありません。</p>}
      {rows.map((r) => (
        <section key={r.id} className="card" style={{ gap: 8, opacity: r.hidden ? 0.6 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span>
              <Stars rating={r.rating} /> <b>{r.nickname}</b>さん
            </span>
            <span style={{ fontSize: 12, color: "var(--sub)" }}>
              {new Date(r.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}／注文 {r.order_id.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--sub)" }}>
            {storyLabel(r.orders?.drafts?.story)}（主人公：{r.orders?.drafts?.child_name}）／クーポン {r.coupon_code}
            {usedCodes.has(r.coupon_code) ? "（使用済み）" : "（未使用）"}
          </div>
          {r.photo_path && (
            // eslint-disable-next-line @next/next/no-img-element -- 投稿された写真（公開ストレージ）
            <img src={samplePublicUrl(r.photo_path) ?? ""} alt="投稿された写真" style={{ maxWidth: 320, borderRadius: 10 }} />
          )}
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{r.body}</p>
          <ReviewToggle id={r.id} hidden={r.hidden} />
        </section>
      ))}
    </main>
  );
}
