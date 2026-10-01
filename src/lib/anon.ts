import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";

// 登録前のお試しの持ち主を見分けるCookie。会員登録すると、この下書きが会員のものになる。
export const ANON_COOKIE = "ehon_anon";

export async function getAnonId() {
  return (await cookies()).get(ANON_COOKIE)?.value ?? null;
}

/** Route Handler から呼ぶ。Cookieがなければ作る。 */
export async function ensureAnonId() {
  const store = await cookies();
  const existing = store.get(ANON_COOKIE)?.value;
  if (existing) return existing;
  const id = randomUUID();
  store.set(ANON_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

/** IPアドレスはそのまま保存せず、ハッシュにする。 */
export function ipHash(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const salt = process.env.CRON_SECRET ?? "ehon";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
