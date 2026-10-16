import Link from "next/link";
import { redirect } from "next/navigation";
import { REVIEW_COUPON, yen } from "@/lib/catalog";
import { currentUser } from "@/lib/auth";
import { getSupabase } from "@/lib/services";
import { PageHeader } from "@/components/page-header";
import { storyLabel } from "@/lib/story-key";
import { ReviewForm } from "./form";

export const dynamic = "force-dynamic";

// レビューを書く画面（マイページの「レビューを書く」から）。届いた注文の持ち主だけが、1注文につき1件書ける
export default async function ReviewPage({ searchParams }: PageProps<"/account/review">) {
  const { order: orderParam } = await searchParams;
  const orderId = typeof orderParam === "string" ? orderParam : "";
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/account/review?order=${orderId}`)}`);
  const db = getSupabase();
  const { data: order } = db && orderId
    ? await db.from("orders").select("*, drafts(story, child_name)").eq("id", orderId).maybeSingle()
    : { data: null };
  const { data: review } = db && order ? await db.from("reviews").select("coupon_code").eq("order_id", order.id).maybeSingle() : { data: null };
  const draft = (order?.drafts ?? null) as { story?: string; child_name?: string } | null;

  let message: string | null = null;
  if (!order || order.user_id !== user.id) message = "ご注文が見つかりませんでした。";
  else if (order.bundle_of) message = "まとめ買いのレビューは、1話目のご注文から1件だけ書けます。";
  else if (order.status !== "shipped") message = "レビューは、絵本がお手元に届いてから書けます。";
  else if (review) message = `このご注文のレビューは投稿済みです。お礼のクーポン：${review.coupon_code}`;

  return (
    <div className="shell">
      <PageHeader title="レビューを書く" />
      <main className="step-body">
        {message ? (
          <p className="info-note">{message}</p>
        ) : (
          <>
            <p className="step-lead">
              「{storyLabel(draft?.story)}」（主人公：{draft?.child_name}）のご感想をお聞かせください。
              <br />
              投稿いただいたレビューはサイトで公開します。お礼に、次のご注文で1冊目が<b>{yen(REVIEW_COUPON.discount)}引き</b>になるクーポンをお送りします。
            </p>
            <ReviewForm orderId={order!.id} />
          </>
        )}
        <Link href="/account" className="ghost">マイページへもどる</Link>
      </main>
    </div>
  );
}
