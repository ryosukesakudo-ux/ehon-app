import { deliveryLabel, getSize, getStory, getTaste, sceneText, yen } from "@/lib/catalog";
import { BOOK_BUCKET, getSupabase } from "@/lib/services";
import { OrderActions } from "./actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  pending: "決済前",
  paid: "支払い済み・制作待ち",
  generated: "制作完了・発送待ち",
  shipped: "発送済み",
};

type Shipping = {
  name?: string;
  address?: { postal_code?: string; state?: string; city?: string; line1?: string; line2?: string };
} | null;

export default async function AdminPage() {
  const db = getSupabase();
  if (!db) {
    return (
      <main style={{ padding: 24 }}>
        <h1>注文管理</h1>
        <p>Supabase が未設定のため、注文はありません（デモモード）。</p>
        <p><a href="/admin/trial">試作スタジオ（写真から絵本を試しに作る）</a></p>
        <p><a href="/admin/samples">作例スタジオ（見本の絵を作る）</a></p>
      </main>
    );
  }

  const { data: orders, error } = await db
    .from("orders")
    .select("*, drafts(*)")
    .neq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  // 制作済みの絵を表示するための一時URL
  const rows = await Promise.all(
    (orders ?? []).map(async (o) => {
      const story = getStory(o.drafts.story)!;
      const { data: files } = await db.storage.from(BOOK_BUCKET).list(`${o.draft_id}/final`);
      const paths = (files ?? []).map((f) => `${o.draft_id}/final/${f.name}`);
      const { data: urls } = paths.length
        ? await db.storage.from(BOOK_BUCKET).createSignedUrls(paths, 60 * 60)
        : { data: [] };
      return {
        order: o,
        story,
        pages: story.scenes.map((sc, i) => ({
          text: sceneText(sc, o.drafts.child_name),
          url: urls?.find((u) => u.path?.endsWith(`/${String(i).padStart(2, "0")}.png`))?.signedUrl ?? null,
        })),
      };
    }),
  );

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>注文管理</h1>
      <a href="/admin/trial">試作スタジオ（写真から絵本を試しに作る）</a>
      <a href="/admin/samples">作例スタジオ（トップページなどの見本の絵を作る）</a>
      {rows.length === 0 && <p>まだ注文はありません。</p>}
      {rows.map(({ order: o, story, pages }) => {
        const ship = o.shipping as Shipping;
        const a = ship?.address;
        return (
          <section key={o.id} className="card" style={{ gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
              <strong>注文 {o.id.slice(0, 8).toUpperCase()}</strong>
              <span className="tag">{STATUS[o.status] ?? o.status}</span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.8 }}>
              {story.name}／{getTaste(o.drafts.taste)?.name}／主人公「{o.drafts.child_name}」／{getSize(o.size)?.name}サイズ
              {o.extra_copy ? "＋追加1冊" : ""}／{yen(o.amount)}
              <br />
              お届け先：{ship?.name} 〒{a?.postal_code} {a?.state}{a?.city}{a?.line1} {a?.line2}
              <br />
              お届け希望：<strong>{deliveryLabel(o.delivery_date, o.delivery_time)}</strong>
              <br />
              連絡先：{o.email} {o.phone}
              <br />
              写真：{o.drafts.photos_deleted_at ? "削除済み" : "保管中"}
            </div>
            <OrderActions orderId={o.id} status={o.status} sceneCount={story.scenes.length} doneScenes={pages.flatMap((p, i) => (p.url ? [i] : []))} printSizes={o.extra_copy && o.size !== "M" ? [o.size, "M"] : [o.size]} />
            <details>
              <summary>ページ一覧（{pages.filter((p) => p.url).length}/{pages.length} 枚作成済み）</summary>
              <ol style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, padding: 0, listStyle: "none" }}>
                {pages.map((p, i) => (
                  <li key={i} style={{ fontSize: 12, lineHeight: 1.6 }}>
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 署名付きURLの一時画像 */}
                        <img src={p.url} alt={`場面${i + 1}`} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 8 }} />
                      </a>
                    ) : (
                      <div style={{ aspectRatio: "1 / 1", borderRadius: 8, background: "#eee", display: "flex", alignItems: "center", justifyContent: "center" }}>未作成</div>
                    )}
                    {i + 1}. {p.text}
                  </li>
                ))}
              </ol>
            </details>
          </section>
        );
      })}
    </main>
  );
}
