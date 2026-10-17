// ログイン中だけにある Supabase の Cookie（sb-<プロジェクト>-auth-token。長いと .0 .1 に分かれる）の名前か。
// 未ログインの人のときは Supabase への問い合わせを省いて、画面を速く出すために使う（2026-10-17 作道さん「サイトが重い」）。
export function isAuthCookieName(name: string) {
  return /^sb-.+-auth-token(\.\d+)?$/.test(name);
}

/** ブラウザで、ログイン中の Cookie があるか（無ければ未ログインと分かるので、確認の通信を省ける） */
export function hasAuthCookie() {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => isAuthCookieName(c.split("=")[0].trim()));
}
