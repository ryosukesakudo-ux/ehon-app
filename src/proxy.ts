import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { ADMIN_2FA_COOKIE, adminLockedUntil, lockedMessage, recordAdminFailure, verify2faToken } from "@/lib/admin-guard";

// 1. 管理画面と管理用APIをベーシック認証で守る（ユーザー名 admin、パスワードは ADMIN_PASSWORD）。
//    そのあと認証アプリのコードでの二段階認証（/admin/2fa）も必要。続けて10回まちがえると30分ロックする。
// 2. LINE のアプリ内ブラウザで開かれたページは、いつものブラウザ（Safari・Chrome）で開き直す。
// 3. それ以外のページでは、会員のログイン状態（Cookie）を更新する。
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/admin") || path.startsWith("/api/admin")) return adminAuth(request);
  const external = openInExternalBrowser(request);
  if (external) return external;
  return refreshSession(request);
}

// LINE のアプリ内ブラウザでは、写真を選んでも画面が反応しないことがある（2026-10-11 報告）。
// URL に openExternalBrowser=1 を付けると、LINE が外部ブラウザで開き直す（LINE の公式の仕組み）。
// https://developers.line.biz/ja/docs/line-login/using-line-url-scheme/#opening-url-in-external-browser
function openInExternalBrowser(request: NextRequest) {
  // ページを開くときだけ（画面内の移動や画像・APIの読み込みは対象外）
  if (request.method !== "GET" || request.nextUrl.pathname.startsWith("/api")) return null;
  if (request.headers.get("rsc") || !request.headers.get("accept")?.includes("text/html")) return null;
  if (!/ Line\//.test(request.headers.get("user-agent") ?? "")) return null;
  if (request.nextUrl.searchParams.has("openExternalBrowser")) return null;
  const url = request.nextUrl.clone();
  url.searchParams.set("openExternalBrowser", "1");
  return NextResponse.redirect(url);
}

async function adminAuth(request: NextRequest) {
  const lockedUntil = await adminLockedUntil();
  if (lockedUntil) {
    return new NextResponse(lockedMessage(lockedUntil), { status: 423, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const password = process.env.ADMIN_PASSWORD;
  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  let ok = false;
  if (password && scheme === "Basic" && encoded) {
    const [user, ...rest] = atob(encoded).split(":");
    ok = user === "admin" && rest.join(":") === password;
    if (!ok) await recordAdminFailure();
  }
  if (!ok) {
    return new NextResponse("認証が必要です", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="admin", charset="UTF-8"' },
    });
  }

  // 二段階認証の画面とその確認APIは、コードを入れる前でも開ける
  const path = request.nextUrl.pathname;
  if (path === "/admin/2fa" || path === "/api/admin/2fa") return NextResponse.next();
  if (await verify2faToken(request.cookies.get(ADMIN_2FA_COOKIE)?.value)) return NextResponse.next();

  if (path.startsWith("/api/")) return Response.json({ error: "二段階認証が必要です。管理画面を開き直してください" }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/admin/2fa";
  url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

async function refreshSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  // 期限切れ間近のログイン情報をここで更新する
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|api/stripe/webhook|api/cron).*)"],
};
