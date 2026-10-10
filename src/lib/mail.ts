import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { SITE_NAME } from "@/components/brand";

// メール送信（SMTP）。Gmail のアプリ パスワード（Supabase の登録メールと同じもの）や Resend の SMTP で送る。
// SMTP_USER・SMTP_PASS が未設定ならメールは送らない（デモモード）。
// - SMTP_HOST：既定は smtp.gmail.com（Resend なら smtp.resend.com）
// - SMTP_PORT：既定は 465
// - MAIL_FROM：差出人。既定は「絵本 Only Yours <SMTP_USER>」（Resend のときは noreply@ドメイン などを入れる）

let transporter: Transporter | null | undefined;
function getTransporter() {
  if (transporter !== undefined) return transporter;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT ?? 465);
  transporter =
    user && pass
      ? nodemailer.createTransport({ host: process.env.SMTP_HOST ?? "smtp.gmail.com", port, secure: port === 465, auth: { user, pass } })
      : null;
  return transporter;
}

export function mailConfigured() {
  return !!getTransporter();
}

/** 送れたら true。設定が無いときは送らずに false。 */
export async function sendMail(to: string, subject: string, text: string, html?: string) {
  const t = getTransporter();
  if (!t) {
    console.warn("mail not configured; skipped:", subject);
    return false;
  }
  const from = process.env.MAIL_FROM ?? `"${SITE_NAME}" <${process.env.SMTP_USER}>`;
  await t.sendMail({ from, to, subject, text, html });
  return true;
}
