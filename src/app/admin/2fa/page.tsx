import QRCode from "qrcode";
import { newTotpSecret, totpUri } from "@/lib/admin-guard";
import { CodeForm } from "./form";

export const dynamic = "force-dynamic";

// 管理画面の二段階認証。
// - ADMIN_TOTP_SECRET が未設定：認証アプリの登録手順（QRコードと、Vercel に入れる値）を出す。
// - 設定済み：認証アプリの6桁のコードを入れる。
export default async function Admin2faPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const back = next?.startsWith("/admin") || next?.startsWith("/api/admin") ? next : "/admin";
  const box = { maxWidth: 560, margin: "0 auto", padding: "32px 16px 64px", display: "flex", flexDirection: "column" as const, gap: 16, lineHeight: 1.8 };

  if (!process.env.ADMIN_TOTP_SECRET) {
    const secret = newTotpSecret();
    const qr = await QRCode.toDataURL(totpUri(secret), { width: 220, margin: 1 });
    return (
      <main style={box}>
        <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>管理画面の二段階認証を設定する</h1>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>スマホに認証アプリ（Google Authenticator など）を入れ、「＋」→「QRコードをスキャン」で下のQRコードを読み取ります。</li>
          <li>
            https://vercel.com の ehon-app → Settings → Environment Variables で、名前 <code>ADMIN_TOTP_SECRET</code>、値に下の英数字を入れて Save します。
          </li>
          <li>Deployments → いちばん上の行の右端「︙」→ Redeploy を押します。</li>
          <li>もう一度 /admin を開き、認証アプリに出ている6桁の数字を入れます。</li>
        </ol>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="認証アプリ用のQRコード" width={220} height={220} />
        <p style={{ margin: 0 }}>
          Vercel に入れる値：<code style={{ fontSize: 16, userSelect: "all", wordBreak: "break-all" }}>{secret}</code>
        </p>
        <p style={{ margin: 0, fontSize: 13 }}>
          この画面を開くたびに別の値になります。QRコードを読み取ったときと同じ画面の値を入れてください。この値は人に見せないでください。
        </p>
      </main>
    );
  }

  return (
    <main style={box}>
      <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>認証アプリのコード</h1>
      <p style={{ margin: 0 }}>スマホの認証アプリに出ている6桁の数字を入れてください。</p>
      <CodeForm next={back} />
    </main>
  );
}
