import {
  ADMIN_2FA_COOKIE,
  ADMIN_2FA_HOURS,
  issue2faToken,
  recordAdminFailure,
  recordAdminSuccess,
  verifyTotp,
} from "@/lib/admin-guard";

// 認証アプリの6桁のコードを確かめ、正しければ12時間有効のしるし（Cookie）を渡す。
// まちがえた回数はパスワードのまちがいと合わせて数え、10回続くと proxy.ts がロックする。
// （ここに来る前に proxy.ts でベーシック認証とロックの確認が済んでいる）
export async function POST(request: Request) {
  const secret = process.env.ADMIN_TOTP_SECRET;
  if (!secret) return Response.json({ error: "ADMIN_TOTP_SECRET が未設定です" }, { status: 503 });
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";

  if (!(await verifyTotp(secret, code))) {
    await recordAdminFailure();
    return Response.json({ error: "コードがちがいます。認証アプリの今の数字を入れてください" }, { status: 400 });
  }
  await recordAdminSuccess();
  const res = Response.json({ ok: true });
  res.headers.append(
    "set-cookie",
    `${ADMIN_2FA_COOKIE}=${await issue2faToken()}; Path=/; Max-Age=${ADMIN_2FA_HOURS * 3600}; HttpOnly; Secure; SameSite=Strict`,
  );
  return res;
}
