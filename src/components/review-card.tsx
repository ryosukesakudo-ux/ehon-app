import { storyLabel } from "@/lib/story-key";

export type ReviewView = {
  id: string;
  nickname: string;
  rating: number;
  body: string;
  photoUrl: string | null;
  createdAt: string;
  story: string | null;
};

export function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <span aria-label={`星${rating}つ`} style={{ fontSize: size, letterSpacing: 1, lineHeight: 1 }}>
      <span style={{ color: "#F6C445" }}>{"★".repeat(rating)}</span>
      <span style={{ color: "#d9cfbd" }}>{"★".repeat(5 - rating)}</span>
    </span>
  );
}

/** レビュー1件（トップの欄とレビュー一覧で使う） */
export function ReviewCard({ review: r, clamp }: { review: ReviewView; clamp?: boolean }) {
  return (
    <article className="card" style={{ gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Stars rating={r.rating} />
        <span style={{ fontSize: 12, color: "var(--sub)" }}>
          {new Date(r.createdAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" })}
        </span>
      </div>
      {r.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- お客様が投稿した写真（公開ストレージ）
        <img src={r.photoUrl} alt={`${r.nickname}さんの写真`} loading="lazy" style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 12, display: "block" }} />
      )}
      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.8,
          whiteSpace: "pre-wrap",
          ...(clamp ? { display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}),
        }}
      >
        {r.body}
      </p>
      <div style={{ fontSize: 12, color: "var(--sub)" }}>
        {r.nickname}さん{r.story ? `／${storyLabel(r.story)}` : ""}
      </div>
    </article>
  );
}
