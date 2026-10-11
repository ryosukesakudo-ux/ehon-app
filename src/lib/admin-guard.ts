import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 管理画面の守り（Stripe のセキュリティチェックリスト対応）。
// - 二段階認証：ベーシック認証のあと、スマホの認証アプリの6桁のコード（TOTP）を入れる。秘密の値は ADMIN_TOTP_SECRET。
// - アカウントロック：パスワードかコードを続けて10回まちがえると、30分ロックする（記録は Supabase の admin_login_guard）。
// proxy.ts からも使うので、server-only や重いライブラリは読み込まない。

export const ADMIN_2FA_COOKIE = "admin_2fa";
export const ADMIN_2FA_HOURS = 12;
export const ADMIN_MAX_FAILURES = 10;
export const ADMIN_LOCK_MINUTES = 30;

const enc = new TextEncoder();

// ---- 認証アプリのコード（TOTP、RFC 6238：30秒ごと・6桁・SHA-1） ----

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function newTotpSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(text: string) {
  let bits = "";
  for (const ch of text.toUpperCase().replace(/[\s=]/g, "")) {
    const v = BASE32.indexOf(ch);
    if (v < 0) return null;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return bytes;
}

async function hotp(key: Uint8Array<ArrayBuffer>, counter: number) {
  const msg = new DataView(new ArrayBuffer(8));
  msg.setUint32(0, Math.floor(counter / 2 ** 32));
  msg.setUint32(4, counter >>> 0);
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", k, msg.buffer));
  const o = h[h.length - 1] & 0x0f;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

// スマホの時計のずれを考えて、前後30秒のコードも受け付ける
export async function verifyTotp(secret: string, code: string) {
  const key = base32Decode(secret);
  const c = code.replace(/\s/g, "");
  if (!key || !/^\d{6}$/.test(c)) return false;
  const step = Math.floor(Date.now() / 30_000);
  for (const d of [-1, 0, 1]) if ((await hotp(key, step + d)) === c) return true;
  return false;
}

export function totpUri(secret: string) {
  const label = encodeURIComponent("えほん Only Yours:admin");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent("えほん Only Yours")}`;
}

// ---- 二段階認証が済んだしるし（Cookie、12時間有効） ----

async function sign(text: string) {
  const secret = `${process.env.ADMIN_TOTP_SECRET ?? ""}:${process.env.ADMIN_PASSWORD ?? ""}`;
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(text)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function issue2faToken() {
  const exp = String(Date.now() + ADMIN_2FA_HOURS * 3600_000);
  return `${exp}.${await sign(exp)}`;
}

export async function verify2faToken(token: string | undefined) {
  if (!token || !process.env.ADMIN_TOTP_SECRET) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = await sign(exp);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

// ---- アカウントロック ----
// 表がまだ無い（schema.sql 未実行）ときは、ロックせずに通す（エラーはログに残す）。

let db: SupabaseClient | null | undefined;
function guardDb() {
  if (db !== undefined) return db;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  db = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return db;
}

// ロック中なら、解除される時刻を返す
export async function adminLockedUntil(): Promise<Date | null> {
  const client = guardDb();
  if (!client) return null;
  const { data, error } = await client.from("admin_login_guard").select("locked_until").eq("id", 1).maybeSingle();
  if (error) {
    console.error("admin lock check failed", error);
    return null;
  }
  const until = data?.locked_until ? new Date(data.locked_until) : null;
  return until && until > new Date() ? until : null;
}

export async function recordAdminFailure() {
  const client = guardDb();
  if (!client) return;
  const { error } = await client.rpc("admin_login_failed", { p_max: ADMIN_MAX_FAILURES, p_minutes: ADMIN_LOCK_MINUTES });
  if (error) console.error("admin failure record failed", error);
}

export async function recordAdminSuccess() {
  const client = guardDb();
  if (!client) return;
  const { error } = await client.rpc("admin_login_ok");
  if (error) console.error("admin success record failed", error);
}

export function lockedMessage(until: Date) {
  const time = until.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
  return `パスワードかコードを${ADMIN_MAX_FAILURES}回続けてまちがえたため、管理画面をロックしています。${time}ごろに解除されます。`;
}
