import "server-only";
import { CHILD_AGES, clampCopies, getSize, getStory, getTaste, type SizeId, type StoryId, type TasteId } from "./catalog";
import { createAuthClient } from "./auth";

// 作成途中の内容（下書き）。会員が作成画面から「保存して中断」を押したときに、
// アカウント（Supabase Auth のユーザー情報）に1件だけ保存し、別の端末でも「つづきから」再開できるようにする。
// 選んだだけでまだ送っていない写真は保存しない（会員は保存済みの写真から選び直せる）。

/** 再開できる画面（作成フローの各ステップ） */
export const FLOW_STEPS = {
  "/create/taste": "テイスト選び",
  "/create/story": "お話選び",
  "/create/photo": "写真えらび",
  "/create/preview": "できあがりの確認",
  "/create/size": "サイズ選び",
  "/create/checkout": "注文内容の確認",
} as const;
export type FlowPath = keyof typeof FLOW_STEPS;

export type FlowSave = {
  path: FlowPath;
  savedAt: string;
  taste: TasteId;
  story: StoryId;
  childName: string;
  childAge: number | null;
  draftId: string | null;
  size: SizeId;
  copies: number;
  deliveryDate: string;
  deliveryTime: string;
};

const KEY = "flow_save";

/** 画面から送られた内容を、保存してよい形にそろえる。おかしな値なら null。 */
export function parseFlowSave(input: unknown): FlowSave | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  const str = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
  const path = str(v.path, 40);
  if (!(path in FLOW_STEPS)) return null;
  const taste = str(v.taste, 20);
  const story = str(v.story, 20);
  const size = str(v.size, 4);
  if (!getTaste(taste) || !getStory(story)) return null;
  const age = Number(v.childAge);
  const draftId = str(v.draftId, 2000);
  return {
    path: path as FlowPath,
    savedAt: new Date().toISOString(),
    taste: taste as TasteId,
    story: story as StoryId,
    childName: str(v.childName, 12),
    childAge: CHILD_AGES.includes(age) ? age : null,
    // デモ用の下書き（id に中身を埋め込んだもの）は保存しない
    draftId: draftId && !draftId.startsWith("demo.") ? draftId : null,
    size: getSize(size) ? (size as SizeId) : "M",
    // 以前の保存（2冊目のチェック）は2部として読む
    copies: clampCopies(v.copies ?? (v.extraCopy === true ? 2 : 1)),
    deliveryDate: /^\d{4}-\d{2}-\d{2}$/.test(str(v.deliveryDate, 10)) ? str(v.deliveryDate, 10) : "",
    deliveryTime: str(v.deliveryTime, 20),
  };
}

export async function getFlowSave(): Promise<FlowSave | null> {
  const client = await createAuthClient();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  const saved = data.user?.user_metadata?.[KEY];
  return saved && typeof saved === "object" && (saved as FlowSave).path in FLOW_STEPS ? (saved as FlowSave) : null;
}

/** 保存する（null で消す）。ログインしていなければ false。 */
export async function putFlowSave(save: FlowSave | null): Promise<boolean> {
  const client = await createAuthClient();
  if (!client) return false;
  const { data } = await client.auth.getUser();
  if (!data.user) return false;
  const { error } = await client.auth.updateUser({ data: { [KEY]: save } });
  if (error) throw new Error(error.message);
  return true;
}
