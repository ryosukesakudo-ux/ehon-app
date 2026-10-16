"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ReviewCard, type ReviewView } from "@/components/review-card";

// トップの「みんなのレビュー」。トップは静的なページなので、レビューは開いたときに読み込む。
// まだ1件もないときは欄ごと出さない。後から出る欄なので、スクロールで表示する演出（data-reveal）は付けない
export function TopReviews({ className, style, children }: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const [reviews, setReviews] = useState<ReviewView[] | null>(null);
  useEffect(() => {
    fetch("/api/reviews?limit=3")
      .then((r) => r.json())
      .then((j) => setReviews(j.reviews ?? []))
      .catch(() => setReviews([]));
  }, []);
  if (!reviews?.length) return null;
  return (
    <section className={className} style={style}>
      {children}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {reviews.map((r) => (
          <ReviewCard key={r.id} review={r} clamp />
        ))}
      </div>
      <Link href="/reviews" className="ghost">レビューをもっと見る</Link>
    </section>
  );
}
