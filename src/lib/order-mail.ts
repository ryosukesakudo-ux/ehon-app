import "server-only";
import { SITE_NAME } from "@/components/brand";
import { deliveryLabel, getSize, getStory, getTaste, yen } from "./catalog";
import { sendMail } from "./mail";
import { getSupabase } from "./services";

type Address = { postal_code?: string | null; state?: string | null; city?: string | null; line1?: string | null; line2?: string | null };

function escapeHtml(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
}

/**
 * 支払いが済んだ注文の「ご注文完了」メールを、会員登録のメールアドレスに送る。
 * 登録アドレスが分からないときは、決済画面で入力されたアドレスに送る。
 */
export async function sendOrderConfirmation(orderId: string, base: string) {
  const db = getSupabase();
  if (!db) return false;
  const { data: o } = await db.from("orders").select("*, drafts(*)").eq("id", orderId).maybeSingle();
  if (!o) return false;

  let to: string | null = null;
  if (o.user_id) {
    const { data } = await db.auth.admin.getUserById(o.user_id);
    to = data.user?.email ?? null;
  }
  to ??= o.email ?? null;
  if (!to) return false;

  const orderNo = String(o.id).slice(0, 8).toUpperCase();
  const size = getSize(o.size);
  const copies: number = o.copies ?? (o.extra_copy ? 2 : 1);
  const ship = (o.shipping ?? null) as { name?: string | null; address?: Address | null } | null;
  const a = ship?.address;
  const name = ship?.name ? `${ship.name} 様` : "お客様";
  const discount: number = o.discount ?? 0;

  const lines: [string, string][] = [
    ["注文番号", orderNo],
    ["お話", `${getStory(o.drafts?.story)?.name ?? ""}（主人公：${o.drafts?.child_name ?? ""}）`],
    ["テイスト", getTaste(o.drafts?.taste)?.name ?? ""],
    ["サイズ", `${size?.name ?? o.size}サイズ（${size?.spec ?? ""}）×${copies}冊`],
    ...(discount > 0 ? ([["クーポン", `${o.coupon_code}（${yen(discount)}引き）`]] as [string, string][]) : []),
    ["お支払い金額", `${yen(o.amount)}（送料・税込）`],
    ["お届け先", a ? `〒${a.postal_code ?? ""} ${a.state ?? ""}${a.city ?? ""}${a.line1 ?? ""} ${a.line2 ?? ""}　${ship?.name ?? ""} 様` : ""],
    ["お届け希望", deliveryLabel(o.delivery_date, o.delivery_time)],
  ];
  const account = `${base}/account`;
  const subject = `【${SITE_NAME}】ご注文ありがとうございます（注文番号 ${orderNo}）`;
  const intro = `${name}\n\nこのたびは「${SITE_NAME}」でご注文いただき、ありがとうございます。\nお支払いを確認しましたので、絵本の制作を始めます。`;
  const flow = "このあとの流れ\n1. 絵本の全ページの絵を仕上げ、印刷・製本します\n2. 数日後に発送します（発送したらマイページでお知らせします）";
  const outro = `ご注文の状況と絵本の絵は、マイページでご確認いただけます。\n${account}\n\nご不明な点は、このメールにご返信ください。\n\n${SITE_NAME}\n${base}`;

  const text = [intro, "", "■ ご注文内容", ...lines.map(([k, v]) => `${k}：${v}`), "", flow, "", outro].join("\n");
  const html = `<div style="font-family:sans-serif;font-size:15px;line-height:1.8;color:#1e2f57;max-width:560px">
<p>${escapeHtml(intro).replaceAll("\n", "<br>")}</p>
<h2 style="font-size:17px;color:#f08a6c;margin:24px 0 8px">ご注文内容</h2>
<table style="border-collapse:collapse;width:100%">${lines
    .map(([k, v]) => `<tr><th style="text-align:left;padding:6px 12px 6px 0;white-space:nowrap;vertical-align:top;color:#4f6f9f">${escapeHtml(k)}</th><td style="padding:6px 0">${escapeHtml(v)}</td></tr>`)
    .join("")}</table>
<p style="margin-top:24px">${escapeHtml(flow).replaceAll("\n", "<br>")}</p>
<p><a href="${account}" style="display:inline-block;padding:12px 24px;border-radius:24px;background:#f08a6c;color:#fff;text-decoration:none;font-weight:bold">マイページを見る</a></p>
<p style="color:#4f6f9f;font-size:13px">ご不明な点は、このメールにご返信ください。<br>${escapeHtml(SITE_NAME)}　<a href="${base}">${base}</a></p>
</div>`;
  return sendMail(to, subject, text, html);
}
