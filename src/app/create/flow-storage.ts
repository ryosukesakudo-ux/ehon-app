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
  void clearLocalPhotos();
}

/** 作成画面のはじめ（主人公の入力）より先に進んでいるか（ログイン後に「つくりかけ」として引き継ぐ価値があるか） */
export function hasProgress(v: Record<string, unknown> | null): v is Record<string, unknown> & { path: string } {
  return !!v && typeof v.path === "string" && v.path !== "/create/taste";
}

// 選んだ写真（顔を囲んで切り出したもの）も、送る前ならこのブラウザ（IndexedDB）に残す。
// お試し済みで「会員登録・ログイン」へ進んだとき、戻ってきても写真を選び直さなくて済むようにする。
// 送ったら消す。ほかの端末やサーバーには送らない。
const DB_NAME = "ehon-flow";
const STORE = "photos";
const PHOTOS_KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function photoStore<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function readLocalPhotos<T extends object>(): Promise<T | null> {
  try {
    const v = await photoStore("readonly", (s) => s.get(PHOTOS_KEY));
    if (!v || typeof v !== "object") return null;
    if (typeof v.updatedAt !== "number" || Date.now() - v.updatedAt > MAX_AGE_MS) {
      await clearLocalPhotos();
      return null;
    }
    return v.photos as T;
  } catch {
    return null;
  }
}

/** 写真が1枚もなければ消す */
export async function writeLocalPhotos(photos: object, empty: boolean) {
  try {
    if (empty) await clearLocalPhotos();
    else await photoStore("readwrite", (s) => s.put({ photos, updatedAt: Date.now() }, PHOTOS_KEY));
  } catch {}
}

export async function clearLocalPhotos() {
  try {
    await photoStore("readwrite", (s) => s.delete(PHOTOS_KEY));
  } catch {}
}
