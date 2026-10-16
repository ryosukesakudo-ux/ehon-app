import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/components/brand";
import { PageHeader } from "@/components/page-header";
import { ReviewCard, Stars } from "@/components/review-card";
import { listPublicReviews, summarize } from "@/lib/reviews";

export const metadata: Metadata = { title: `みんなのレビュー | ${SITE_NAME}` };
// 投稿はすぐ公開するので、開くたびに読み直す
export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const reviews = await listPublicReviews(100);
  const sum = summarize(reviews);
  return (
    <div className="shell">
      <PageHeader title="みんなのレビュー" />
      <main className="step-body">
        {sum ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
            <Stars rating={Math.round(sum.average)} size={22} />
            <span className="display" style={{ fontSize: 20, fontWeight: 900, color: "var(--navy)" }}>{sum.average.toFixed(1)}</span>
            <span style={{ fontSize: 13, color: "var(--sub)" }}>（{sum.count}件）</span>
          </div>
        ) : (
          <p className="step-lead">まだレビューはありません。</p>
        )}
        {reviews.map((r) => (
          <ReviewCard key={r.id} review={r} />
        ))}
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
          レビューは、絵本をお届けしたお客様に書いていただいたものです。
        </p>
        <Link href="/" className="ghost">トップへもどる</Link>
      </main>
    </div>
  );
}
