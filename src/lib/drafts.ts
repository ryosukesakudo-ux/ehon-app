import "server-only";
import { toFile } from "openai";
import { BOOK_BUCKET, PHOTO_BUCKET, getOpenAI, getSupabase } from "./services";
import { illustrate, type Quality, type Redo, type RefImage } from "./illustrate";
import { CHARACTER_SCENES, COVER_SCENE, PERSON_LABEL, characterOf, getStory, getTaste, previewScenes, type Person, type StoryId, type TasteId } from "./catalog";
import { currentUser, type Member } from "./auth";
import { getAnonId } from "./anon";

export type Draft = {
  id: string;
  user_id: string | null;
  anon_id: string | null;
  taste: TasteId;
  story: StoryId;
  child_name: string;
  child_age: number | null;
  child_photo_path: string | null;
  mom_photo_path: string | null;
  dad_photo_path: string | null;
  /** 写真から作ったキャラクターの絵（BOOK_BUCKET）。保存したキャラクターを選んだときは、そのキャラクターの絵 */
  child_character_path?: string | null;
  mom_character_path?: string | null;
  dad_character_path?: string | null;
  generation_count: number;
  photos_deleted_at: string | null;
  images_deleted_at: string | null;
  created_at?: string;
};

export type { Quality };

// --- デモモード（Supabase 未設定）では下書きの中身を id に埋め込む ---
const DEMO_PREFIX = "demo.";

export function isDemoId(id: string) {
  return id.startsWith(DEMO_PREFIX);
}

export function demoDraftId(d: { taste: TasteId; story: StoryId; childName: string; childAge: number | null; hasMom: boolean; hasDad: boolean }) {
  return DEMO_PREFIX + Buffer.from(JSON.stringify(d)).toString("base64url");
}

function parseDemoId(id: string): Draft {
  const d = JSON.parse(Buffer.from(id.slice(DEMO_PREFIX.length), "base64url").toString());
  return {
    id,
    user_id: null,
    anon_id: null,
    taste: d.taste,
    story: d.story,
    child_name: String(d.childName ?? ""),
    child_age: typeof d.childAge === "number" ? d.childAge : null,
    child_photo_path: null,
    mom_photo_path: d.hasMom ? "demo" : null,
    dad_photo_path: d.hasDad ? "demo" : null,
    generation_count: 0,
    photos_deleted_at: null,
    images_deleted_at: null,
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

/** 会員本人の下書きか、登録前のお試しならそのブラウザの下書きかを確かめて読み込む。 */
export async function loadOwnedDraft(id: string): Promise<{ draft: Draft; user: Member | null } | null> {
  const draft = await loadDraft(id);
  if (!draft) return null;
  if (isDemoId(id)) return { draft, user: null };
  const user = await currentUser();
  if (draft.user_id) return user && user.id === draft.user_id ? { draft, user } : null;
  const anonId = await getAnonId();
  return anonId && draft.anon_id === anonId ? { draft, user } : null;
}

// --- 画像生成 ---

const PEOPLE: Person[] = ["child", "mom", "dad"];

function photoOf(draft: Draft, who: Person) {
  return draft[`${who}_photo_path`] ?? null;
}

function characterPathOf(draft: Draft, who: Person) {
  return draft[`${who}_character_path`] ?? null;
}

/** 絵本に登場する人（写真かキャラクターがある人） */
export function draftPeople(draft: Draft): Person[] {
  return PEOPLE.filter((p) => photoOf(draft, p) || characterPathOf(draft, p));
}

/** この下書きのプレビューで作る絵の番号（表紙と、登場する人ごとのキャラクター） */
export function draftPreviewScenes(draft: Draft) {
  const people = draftPeople(draft);
  return previewScenes({ hasMom: people.includes("mom"), hasDad: people.includes("dad") });
}

/** この下書きで作ったキャラクターの保存先（作り直すと上書きする） */
export function characterPath(draftId: string, who: Person) {
  return `characters/${draftId}/${who}.png`;
}

function demoImage(draft: Draft, sceneIndex: number) {
  const taste = getTaste(draft.taste)!;
  const story = getStory(draft.story)!;
  const cover = sceneIndex === COVER_SCENE;
  const who = characterOf(sceneIndex);
  const scene = cover ? { art: story.cover } : who ? { art: `${PERSON_LABEL[who]}のキャラクター（全身・正面）` } : story.scenes[sceneIndex];
  const h = cover ? 683 : 1024;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 ${h}"><rect width="1024" height="${h}" fill="${taste.swatch}"/><circle cx="820" cy="190" r="90" fill="#F6C445"/><path d="M0 760 C 260 640 520 820 1024 700 L1024 1024 L0 1024Z" fill="#ffffff" opacity="0.55"/><text x="512" y="480" font-size="40" text-anchor="middle" fill="#43505C" font-family="sans-serif">[デモ画像] ${cover ? "表紙" : who ? PERSON_LABEL[who] : `場面 ${sceneIndex + 1}`}</text><text x="512" y="540" font-size="26" text-anchor="middle" fill="#43505C" font-family="sans-serif">${escapeXml(scene.art.slice(0, 60))}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function escapeXml(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
}

export function pagePath(draftId: string, quality: Quality, sceneIndex: number) {
  return `${draftId}/${quality}/${String(sceneIndex).padStart(2, "0")}.png`;
}

async function download(bucket: string, path: string) {
  const db = getSupabase()!;
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`画像の読み込みに失敗しました: ${error?.message}`);
  return toFile(data, path.split("/").pop() ?? "image.png", { type: data.type || "image/png" });
}

/**
 * 1場面の挿絵（またはキャラクターの絵）を作り、表示用のURLを返す。
 * 参考にするのは写真と、作ってあるキャラクターの絵。写真が削除されていても、キャラクターがあれば描ける。
 * redo：作り直しの指示（選択肢と一言）。
 */
export async function generateScene(draft: Draft, sceneIndex: number, quality: Quality, redo?: Redo | null): Promise<string> {
  const db = getSupabase();
  const ai = getOpenAI();
  if (!db || !ai || isDemoId(draft.id)) return demoImage(draft, sceneIndex);

  if (!photoOf(draft, "child") && !characterPathOf(draft, "child")) {
    throw new Error("写真が見つかりません（削除済みの可能性があります）");
  }

  const target = characterOf(sceneIndex);
  const images: RefImage[] = [];
  for (const who of target ? [target] : draftPeople(draft)) {
    const photo = photoOf(draft, who);
    const character = characterPathOf(draft, who);
    if (photo) images.push({ who, kind: "photo", file: await download(PHOTO_BUCKET, photo) });
    if (!character) continue;
    if (!target) images.push({ who, kind: "character", file: await download(BOOK_BUCKET, character) });
    // キャラクターの作り直し：指示があるとき（写真が無いときも）は、今の絵をもとに直す
    else if (!photo || (redo && (redo.options.length || redo.note))) {
      images.push({ who, kind: photo ? "previous" : "character", file: await download(BOOK_BUCKET, character) });
    }
  }

  const b64 = await illustrate({ taste: draft.taste, story: draft.story, sceneIndex, images, quality, childAge: draft.child_age, redo });
  const png = Buffer.from(b64, "base64");

  // 会員の写真は「最後に使った日」を更新する（1年使わなければ自動削除）
  const used = PEOPLE.map((p) => photoOf(draft, p)).filter((p): p is string => !!p);
  if (draft.user_id && used.length) {
    await db.from("user_photos").update({ last_used_at: new Date().toISOString() }).in("path", used);
  }

  if (target) await saveCharacter(draft, target, png);

  const path = pagePath(draft.id, quality, sceneIndex);
  const { error } = await db.storage.from(BOOK_BUCKET).upload(path, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`画像の保存に失敗しました: ${error.message}`);
  return signedUrl(path);
}

/** キャラクターの絵を保存し、下書きに結びつける（会員はマイページの「保存しているキャラクター」にも入る）。 */
async function saveCharacter(draft: Draft, who: Person, png: Buffer) {
  const db = getSupabase()!;
  const path = characterPath(draft.id, who);
  const { error } = await db.storage.from(BOOK_BUCKET).upload(path, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`キャラクターの保存に失敗しました: ${error.message}`);
  draft[`${who}_character_path`] = path;
  const { error: draftError } = await db.from("drafts").update({ [`${who}_character_path`]: path }).eq("id", draft.id);
  if (draftError) console.error("draft character update failed", draftError);
  if (draft.user_id) await rememberCharacters(draft.user_id, [{ who, path, taste: draft.taste, childName: draft.child_name }]);
}

/** 会員のキャラクター一覧に入れる（同じ絵は1件にまとめる） */
export async function rememberCharacters(userId: string, items: { who: Person; path: string; taste: string; childName: string }[]) {
  const db = getSupabase();
  if (!db || !items.length) return;
  const now = new Date().toISOString();
  const { error } = await db.from("characters").upsert(
    items.map((c) => ({ user_id: userId, person: c.who, taste: c.taste, child_name: c.childName, path: c.path, updated_at: now })),
    { onConflict: "path" },
  );
  if (error) console.error("character save failed", error);
}

/** 保存しているキャラクターを選んで始めた下書きで、同じテイストならその絵をそのままプレビューに使う（作り直し回数に数えない）。 */
export async function copySavedCharacters(draft: Draft, sameTaste: Person[]) {
  const db = getSupabase();
  if (!db) return;
  for (const who of sameTaste) {
    const from = characterPathOf(draft, who);
    if (!from) continue;
    const { error } = await db.storage.from(BOOK_BUCKET).copy(from, pagePath(draft.id, "preview", CHARACTER_SCENES[who]));
    if (error) console.error("character copy failed", error);
  }
}

/** 作成済みのプレビューの絵（場面番号→一時URL） */
export async function previewUrls(draftId: string): Promise<Record<number, string>> {
  const db = getSupabase();
  if (!db || isDemoId(draftId)) return {};
  const { data: files } = await db.storage.from(BOOK_BUCKET).list(`${draftId}/preview`);
  const paths = (files ?? []).map((f) => `${draftId}/preview/${f.name}`);
  if (!paths.length) return {};
  const { data } = await db.storage.from(BOOK_BUCKET).createSignedUrls(paths, 60 * 60);
  const out: Record<number, string> = {};
  for (const u of data ?? []) {
    const m = u.path?.match(/\/(\d+)\.png$/);
    if (m && u.signedUrl) out[Number(m[1])] = u.signedUrl;
  }
  return out;
}

/** 下書きの絵（プレビューと本番）をすべて削除する。 */
export async function deleteDraftImages(draftId: string) {
  const db = getSupabase();
  if (!db) return;
  for (const quality of ["preview", "final"] as const) {
    const { data: files } = await db.storage.from(BOOK_BUCKET).list(`${draftId}/${quality}`);
    const paths = (files ?? []).map((f) => `${draftId}/${quality}/${f.name}`);
    if (paths.length) {
      const { error } = await db.storage.from(BOOK_BUCKET).remove(paths);
      if (error) throw new Error(`絵の削除に失敗しました: ${error.message}`);
    }
  }
  await db.from("drafts").update({ images_deleted_at: new Date().toISOString() }).eq("id", draftId);
}

export async function signedUrl(path: string) {
  const db = getSupabase()!;
  const { data, error } = await db.storage.from(BOOK_BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data) throw new Error(`画像URLの作成に失敗しました: ${error?.message}`);
  return data.signedUrl;
}

/** 登録前のお試しの顔写真とキャラクターを削除する（会員の写真・キャラクターは user_photos・characters 側で管理する）。 */
export async function deleteDraftPhotos(draft: Pick<Draft, "id" | "child_photo_path" | "mom_photo_path" | "dad_photo_path">) {
  const db = getSupabase();
  if (!db) return;
  const paths = [draft.child_photo_path, draft.mom_photo_path, draft.dad_photo_path].filter((p): p is string => !!p);
  if (paths.length) {
    const { error } = await db.storage.from(PHOTO_BUCKET).remove(paths);
    if (error) throw new Error(`写真の削除に失敗しました: ${error.message}`);
  }
  const { error: charError } = await db.storage.from(BOOK_BUCKET).remove(PEOPLE.map((p) => characterPath(draft.id, p)));
  if (charError) throw new Error(`キャラクターの削除に失敗しました: ${charError.message}`);
  await db
    .from("drafts")
    .update({ child_photo_path: null, mom_photo_path: null, dad_photo_path: null, photos_deleted_at: new Date().toISOString() })
    .eq("id", draft.id);
  await db.from("drafts").update({ child_character_path: null, mom_character_path: null, dad_character_path: null }).eq("id", draft.id);
}
