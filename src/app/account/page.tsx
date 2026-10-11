import Link from "next/link";
import { redirect } from "next/navigation";
import { MEMBER_MONTHLY_PREVIEWS, PERSON_LABEL, RETENTION, getSize, getStory, getTaste, yen } from "@/lib/catalog";
import { currentUser } from "@/lib/auth";
import { listCharacters, listPhotos, previewQuota } from "@/lib/account";
import { konbiniVoucher } from "@/lib/konbini";
import { BuyPreviewsButton } from "@/components/buy-previews";
import { BOOK_BUCKET, getSupabase } from "@/lib/services";
import { PageHeader } from "@/components/page-header";
import { FLOW_STEPS, getFlowSave } from "@/lib/flow-save";
import { DeletePhotoButton } from "./delete-photo";
import { DeleteSaveButton } from "./delete-save";
import { SyncLocalFlow } from "./local-flow";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

const ORDER_STATUS: Record<string, string> = {
  pending: "お支払い待ち",
  paid: "制作中",
  generated: "発送準備中",
  shipped: "発送済み",
};

type OrderRow = { id: string; status: string; size: string; amount: number; paid_at: string | null; checkout_completed_at: string | null; refunded_amount?: number | null; stripe_payment_intent?: string | null };

function date(d: Date | string) {
  return new Date(d).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
}

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const { saved: justSaved, credits: creditsParam } = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");
  const db = getSupabase();

  const [save, quota, photos, characters, { data: drafts }] = await Promise.all([
    getFlowSave(),
    previewQuota(user.id),
    listPhotos(user.id),
    listCharacters(user.id),
    db
      ? db
          .from("drafts")
          .select("*, orders(*)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] }),
  ]);

  // 作成済みの絵（本番の絵があればそちら、なければプレビュー）
  const books = await Promise.all(
    (drafts ?? []).map(async (d) => {
      const orders = ((d.orders ?? []) as OrderRow[]).filter((o) => o.status !== "pending" || o.checkout_completed_at);
      const paid = orders.find((o) => o.paid_at);
      let urls: string[] = [];
      if (db && !d.images_deleted_at) {
        for (const quality of paid ? ["final", "preview"] : ["preview"]) {
          const { data: files } = await db.storage.from(BOOK_BUCKET).list(`${d.id}/${quality}`);
          const paths = (files ?? []).map((f) => `${d.id}/${quality}/${f.name}`);
          if (!paths.length) continue;
          const { data } = await db.storage.from(BOOK_BUCKET).createSignedUrls(paths, 60 * 60);
          urls = (data ?? []).map((u) => u.signedUrl).filter((u): u is string => !!u);
          break;
        }
      }
      const keepUntil = paid?.paid_at
        ? new Date(new Date(paid.paid_at).getTime() + RETENTION.paidImageDays * DAY)
        : new Date(new Date(d.created_at).getTime() + RETENTION.unpaidImageDays * DAY);
      // コンビニ払いのお支払い待ちは、お支払い番号の画面を開けるようにする
      const vouchers = Object.fromEntries(
        await Promise.all(
          orders
            .filter((o) => o.status === "pending" && o.stripe_payment_intent)
            .map(async (o) => [o.id, (await konbiniVoucher(o.stripe_payment_intent))?.url ?? null] as const),
        ),
      );
      return { draft: d, orders, paid, urls, keepUntil, vouchers };
    }),
  );

  return (
    <div className="shell">
      <PageHeader title="マイページ" />
      <main className="step-body">
        <SyncLocalFlow savedAt={save?.savedAt ?? null} />
        {justSaved === "1" && save && <p className="info-note" role="status">下書きを保存しました。「つづきから」で再開できます。</p>}
        {save && (
          <section className="card" style={{ gap: 10, border: "2px solid var(--coral)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <div>
                <div className="display" style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>つくりかけの絵本</div>
                <div style={{ fontSize: 12, color: "var(--sub)", lineHeight: 1.7 }}>
                  {getStory(save.story)?.name}／{getTaste(save.taste)?.name}
                  {save.childName ? `／主人公「${save.childName}」` : ""}
                  <br />
                  {FLOW_STEPS[save.path]}の画面で保存（{date(save.savedAt)}）
                </div>
              </div>
              <span className="tag" style={{ flexShrink: 0 }}>下書き</span>
            </div>
            {!save.draftId && save.path !== "/create/taste" && save.path !== "/create/story" && (
              <p className="step-lead" style={{ fontSize: 12 }}>写真はもう一度えらんでください（保存済みの写真からも選べます）。</p>
            )}
            <Link href="/create/resume?saved=1" className="cta" style={{ height: 50, fontSize: 16 }}>つづきから</Link>
            <DeleteSaveButton />
          </section>
        )}
        {creditsParam === "done" && <p className="info-note" role="status">ご購入ありがとうございます。反映まで少しかかる場合は、画面を再読み込みしてください。</p>}
        <div className="card" style={{ padding: 18, gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--sub)" }}>プレビュー残り</div>
              <div className="display" style={{ fontSize: 28, fontWeight: 900, color: "var(--coral)" }}>
                {quota.remaining}<span style={{ fontSize: 15, color: "var(--sub)" }}>枚</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--sub)" }}>
                今月の無料 {quota.free} / {MEMBER_MONTHLY_PREVIEWS}枚{quota.credits > 0 ? `＋追加 ${quota.credits}枚` : ""}
              </div>
            </div>
            <Link href="/create/taste" className="cta" style={{ width: "auto", height: 48, padding: "0 20px", fontSize: 15 }}>
              新しくつくる
            </Link>
          </div>
          <BuyPreviewsButton returnTo="/account" />
          <p className="step-lead" style={{ fontSize: 12, margin: 0 }}>無料分は毎月1日に{MEMBER_MONTHLY_PREVIEWS}枚に戻ります。追加分は使い切るまで有効です。</p>
        </div>

        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 19, color: "var(--navy)" }}>つくった絵本</h2>
          {books.length === 0 && <p className="step-lead">まだありません。</p>}
          {books.map(({ draft: d, orders, paid, urls, keepUntil, vouchers }) => (
            <article key={d.id} className="card" style={{ gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div>
                  <div className="display" style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>{getStory(d.story)?.name}</div>
                  <div style={{ fontSize: 12, color: "var(--sub)" }}>
                    主人公「{d.child_name}」／{getTaste(d.taste)?.name}／{date(d.created_at)} 作成
                  </div>
                </div>
                {orders[0] && <span className="tag" style={{ flexShrink: 0 }}>{ORDER_STATUS[orders[0].status]}</span>}
              </div>
              {urls.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
                  {urls.map((u, i) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- 署名付きURLの一時画像 */}
                      <img src={u} alt={`${i + 1}枚目の絵`} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 10, display: "block" }} />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="step-lead" style={{ fontSize: 12 }}>{d.images_deleted_at ? "保存期間が過ぎたため、絵は削除されました。" : "まだ絵はありません。"}</p>
              )}
              {orders.map((o) => (
                <div key={o.id} style={{ fontSize: 13, color: "var(--sub)" }}>
                  ご注文：{getSize(o.size)?.name}サイズ／{yen(o.amount)}
                  {o.paid_at ? `／${date(o.paid_at)} お支払い` : ""}
                  {o.refunded_amount ? `／${yen(o.refunded_amount)} 返金済み` : ""}
                  {vouchers[o.id] && (
                    <>
                      ／<a href={vouchers[o.id]!} target="_blank" rel="noreferrer">コンビニのお支払い番号を見る</a>
                    </>
                  )}
                </div>
              ))}
              {!d.images_deleted_at && urls.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--sub)" }}>絵の保存期限：{keepUntil.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })} まで</div>
              )}
              {!paid && (d.child_photo_path || d.child_character_path) && !d.images_deleted_at && (
                <Link href={`/create/resume?draft=${d.id}`} className="ghost">つづきから</Link>
              )}
            </article>
          ))}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 19, color: "var(--navy)" }}>保存しているキャラクター</h2>
          <p className="step-lead" style={{ fontSize: 12 }}>
            写真から作った登場人物の絵です。次の絵本でも同じ姿で登場させられます。会員でいる間は保存し、いつでも削除できます。
          </p>
          {characters.length === 0 && <p className="step-lead">まだありません。</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            {characters.map((c) => (
              <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- 署名付きURLの一時画像 */}
                <img src={c.url} alt={`${PERSON_LABEL[c.person]}のキャラクター`} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 12, background: "#fff" }} />
                <div style={{ fontSize: 11, color: "var(--sub)", lineHeight: 1.5 }}>
                  {c.person === "child" && c.childName ? c.childName : PERSON_LABEL[c.person]}／{getTaste(c.taste)?.name}
                  <br />
                  {date(c.createdAt)} 作成
                </div>
                <DeletePhotoButton id={c.id} kind="character" />
              </div>
            ))}
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 19, color: "var(--navy)" }}>保存している写真</h2>
          <p className="step-lead" style={{ fontSize: 12 }}>
            次の絵本でも選べます。最後に使ってから1年たった写真は自動で削除します。
          </p>
          {photos.length === 0 && <p className="step-lead">まだありません。</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            {photos.map((p) => (
              <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- 署名付きURLの一時画像 */}
                <img src={p.url} alt="保存している写真" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 12 }} />
                <DeletePhotoButton id={p.id} />
              </div>
            ))}
          </div>
        </section>

        <div style={{ fontSize: 13, color: "var(--sub)" }}>ログイン中：{user.email}</div>
        <Link href="/account/password" className="ghost">パスワードを設定・変更する</Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className="ghost" style={{ width: "100%" }}>ログアウト</button>
        </form>
      </main>
    </div>
  );
}
