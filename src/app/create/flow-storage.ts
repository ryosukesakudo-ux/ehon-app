// 作成途中の内容をこのブラウザに残す（localStorage）。
// タブを閉じても、登録確認メールのリンクを別のタブで開いても、ログインの前後で続きから作れるようにする。
// 以前は sessionStorage（タブごと）に置いていたので、残っていればそちらも読む。

export const FLOW_KEY = "ehon-flow";
/** これより古い途中の内容は使わない */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function readLocalFlow(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(FLOW_KEY) ?? sessionStorage.getItem(FLOW_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    if (typeof v.updatedAt === "number" && Date.now() - v.updatedAt > MAX_AGE_MS) {
      clearLocalFlow();
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export function writeLocalFlow(state: object) {
  try {
    localStorage.setItem(FLOW_KEY, JSON.stringify({ ...state, updatedAt: Date.now() }));
    sessionStorage.removeItem(FLOW_KEY);
  } catch {}
}

export function clearLocalFlow() {
  try {
    localStorage.removeItem(FLOW_KEY);
    sessionStorage.removeItem(FLOW_KEY);
  } catch {}
}

/** テイスト選びより先に進んでいるか（ログイン後に「つくりかけ」として引き継ぐ価値があるか） */
export function hasProgress(v: Record<string, unknown> | null): v is Record<string, unknown> & { path: string } {
  return !!v && typeof v.path === "string" && v.path !== "/create/taste";
}
