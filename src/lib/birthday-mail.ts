import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_NAME } from "@/components/brand";
import { REPEAT_COUPON } from "./catalog";
import { sendMail } from "./mail";
import { SELLER } from "./seller";

function escapeHtml(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
}

// 配信停止のリンクに付ける署名（会員IDを書き換えて他の人を止められないように）。鍵は CRON_SECRET を使う
function stopToken(userId: string) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(`mail-stop:${userId}`).digest("base64url");
}

export function verifyStopToken(userId: string, token: string) {
  const expected = stopToken(userId);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function stopUrl(base: string, userId: string) {
  return `${base}/mail/stop?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(stopToken(userId) ?? "")}`;
}

/** 誕生日の1か月前に送る、続編のご案内メール */
export async function sendBirthdayNotice(opts: { to: string; userId: string; childName: string; age: number; base: string }) {
  const { to, childName, age, base } = opts;
  const create = `${base}/create`;
  const stop = stopUrl(base, opts.userId);
  const subject = `【${SITE_NAME}】${childName}さんの${age}さいのお誕生日まで、あと1か月です`;
  const body = [
    `${childName}さんは、もうすぐ${age}さいですね。`,
    `今年の${childName}さんを主人公にした「続編」の絵本をつくりませんか。`,
    "",
    `クーポンコード「${REPEAT_COUPON.code}」をご注文内容の確認画面で入れると、1冊目が${REPEAT_COUPON.discount}円引きになります。`,
    "マイページに保存したお写真が残っていれば、そこから選べます。最近のお写真にすると、成長した姿で描けます。",
    "お誕生日に届くよう、お届け希望日も選べます。",
  ].join("\n");
  const footer = [
    "このメールは、ご注文時にお誕生日をご入力いただいた方にお送りしています。",
    `今後このご案内が不要な方は、こちらから配信を停止できます：${stop}`,
    "",
    `${SITE_NAME}　${SELLER.name}（${SELLER.email}）`,
    base,
  ].join("\n");
  const text = `${body}\n\n絵本をつくる：${create}\n\n${footer}`;
  const html = `<div style="font-family:sans-serif;font-size:15px;line-height:1.8;color:#1e2f57;max-width:560px">
<p>${escapeHtml(body).replaceAll("\n", "<br>")}</p>
<p style="margin:16px 0;padding:12px 16px;border-radius:12px;background:#fff1ec;font-size:16px">クーポンコード：<b style="color:#f08a6c;font-size:20px;letter-spacing:2px">${REPEAT_COUPON.code}</b>（1冊目が${REPEAT_COUPON.discount}円引き）</p>
<p><a href="${create}" style="display:inline-block;padding:12px 24px;border-radius:24px;background:#f08a6c;color:#fff;text-decoration:none;font-weight:bold">続編の絵本をつくる</a></p>
<p style="color:#4f6f9f;font-size:12px">このメールは、ご注文時にお誕生日をご入力いただいた方にお送りしています。<br>今後このご案内が不要な方は、<a href="${stop}">こちらから配信を停止</a>できます。<br>${escapeHtml(SITE_NAME)}　${escapeHtml(SELLER.name)}（${escapeHtml(SELLER.email)}）<br><a href="${base}">${base}</a></p>
</div>`;
  return sendMail(to, subject, text, html);
}
