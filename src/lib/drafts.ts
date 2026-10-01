import "server-only";
import { toFile } from "openai";
import { BOOK_BUCKET, PHOTO_BUCKET, getOpenAI, getSupabase } from "./services";
import { illustrate, type Person, type Quality } from "./illustrate";
import { getStory, getTaste, type StoryId, type TasteId } from "./catalog";

export type Draft = {
  id: string;
  taste: TasteId;
  story: StoryId;
  child_name: string;
  child_photo_path: string | null;
  mom_photo_path: string | null;
  generation_count: number;
  photos_deleted_at: string | null;
};

export type { Quality };

// --- デモモード（Supabase 未設定）では下書きの中身を id に埋め込む ---
const DEMO_PREFIX = "demo.";

export function isDemoId(id: string) {
  return id.startsWith(DEMO_PREFIX);
}

export function demoDraftId(d: { taste: TasteId; story: StoryId; childName: string; hasMom: boolean }) {
  return DEMO_PREFIX + Buffer.from(JSON.stringify(d)).toString("base64url");
}

function parseDemoId(id: string): Draft {
  const d = JSON.parse(Buffer.from(id.slice(DEMO_PREFIX.length), "base64url").toString());
  return {
    id,
    taste: d.taste,
    story: d.story,
    child_name: String(d.childName ?? ""),
    child_photo_path: null,
    mom_photo_path: d.hasMom ? "demo" : null,
    generation_count: 0,
    photos_deleted_at: null,
  };
}

export async function loadDraft(id: string): Promise<Draft | null> {
  if (isDemoId(id)) {
    try {
      return parseDemoId(id);
    } catch {
      return null;
    }
  }
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db.from("drafts").select("*").eq("id", id).maybeSingle();
  return (data as Draft) ?? null;
}

// --- 画像生成 ---

function demoImage(draft: Draft, sceneIndex: number) {
  const taste = getTaste(draft.taste)!;
  const scene = getStory(draft.story)!.scenes[sceneIndex];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${taste.swatch}"/><circle cx="820" cy="190" r="90" fill="#F6C445"/><path d="M0 760 C 260 640 520 820 1024 700 L1024 1024 L0 1024Z" fill="#ffffff" opacity="0.55"/><text x="512" y="480" font-size="40" text-anchor="middle" fill="#43505C" font-family="sans-serif">[デモ画像] 場面 ${sceneIndex + 1}</text><text x="512" y="540" font-size="26" text-anchor="middle" fill="#43505C" font-family="sans-serif">${escapeXml(scene.art.slice(0, 60))}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function escapeXml(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
}

export function pagePath(draftId: string, quality: Quality, sceneIndex: number) {
  return `${draftId}/${quality}/${String(sceneIndex).padStart(2, "0")}.png`;
}

/** 1場面の挿絵を作り、表示用のURLを返す。 */
export async function generateScene(draft: Draft, sceneIndex: number, quality: Quality): Promise<string> {
  const db = getSupabase();
  const ai = getOpenAI();
  if (!db || !ai || isDemoId(draft.id)) return demoImage(draft, sceneIndex);

  if (!draft.child_photo_path || draft.photos_deleted_at) {
    throw new Error("写真が見つかりません（削除済みの可能性があります）");
  }

  const images: { who: Person; file: Awaited<ReturnType<typeof toFile>> }[] = [];
  for (const [who, path] of [["child", draft.child_photo_path], ["mom", draft.mom_photo_path]] as const) {
    if (!path) continue;
    const { data, error } = await db.storage.from(PHOTO_BUCKET).download(path);
    if (error || !data) throw new Error(`写真の読み込みに失敗しました: ${error?.message}`);
    images.push({ who, file: await toFile(data, path.split("/").pop() ?? "photo.jpg", { type: data.type || "image/jpeg" }) });
  }

  const b64 = await illustrate({ taste: draft.taste, story: draft.story, sceneIndex, images, quality });

  const path = pagePath(draft.id, quality, sceneIndex);
  const { error } = await db.storage
    .from(BOOK_BUCKET)
    .upload(path, Buffer.from(b64, "base64"), { contentType: "image/png", upsert: true });
  if (error) throw new Error(`画像の保存に失敗しました: ${error.message}`);
  return signedUrl(path);
}

export async function signedUrl(path: string) {
  const db = getSupabase()!;
  const { data, error } = await db.storage.from(BOOK_BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data) throw new Error(`画像URLの作成に失敗しました: ${error?.message}`);
  return data.signedUrl;
}

/** 完成後・放置時に顔写真を削除する。 */
export async function deleteDraftPhotos(draft: Pick<Draft, "id" | "child_photo_path" | "mom_photo_path">) {
  const db = getSupabase();
  if (!db) return;
  const paths = [draft.child_photo_path, draft.mom_photo_path].filter((p): p is string => !!p);
  if (paths.length) {
    const { error } = await db.storage.from(PHOTO_BUCKET).remove(paths);
    if (error) throw new Error(`写真の削除に失敗しました: ${error.message}`);
  }
  await db
    .from("drafts")
    .update({ child_photo_path: null, mom_photo_path: null, photos_deleted_at: new Date().toISOString() })
    .eq("id", draft.id);
}
