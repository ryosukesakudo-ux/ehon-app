import "server-only";
import { toFile } from "openai";
import { BOOK_BUCKET, PHOTO_BUCKET, getOpenAI, getSupabase } from "./services";
import { hasRedoRequest, illustrate, upscaleForPrint, type Detail, type Quality, type Redo, type RefImage } from "./illustrate";
import { BOOK_SCENE_COUNT, CHARACTER_SCENES, COVER_SCENE, MAX_GUESTS, PERSON_LABEL, characterOf, getTaste, guestOf, isPageScene, previewScenes, type LikenessId, type Person, type TasteId } from "./catalog";
import { getBook, type Book } from "./book";
import { bookForDraft, siblingPhotos } from "./siblings";
import { parseSeriesKey } from "./story-key";
import { customPhotos, parseCustomKey } from "./custom-story";
import { findSpreadTextSpot } from "./spread-text";
import { isWideImage, sceneSpotPath, sceneTextSide } from "./spread-scene";
import { loadFamily, standInsForDraft } from "./stand-ins";
import { copyBookImage, isViewPath, uploadBookImage, viewUrl, viewUrls, withViews } from "./book-images";
import { currentUser, type Member } from "./auth";
import { getAnonId } from "./anon";

export type Draft = {
  id: string;
  user_id: string | null;
  anon_id: string | null;
  taste: TasteId;
  /** お話の番号（旧版のお話 "forest" か、シリーズの "forest:2:n:mom" など。story-key.ts） */
  story: string;
  child_name: string;
  child_age: number | null;
  child_photo_path: string | null;
  mom_photo_path: string | null;
  dad_photo_path: string | null;
  /** 写真から作ったキャラクターの絵（BOOK_BUCKET）。保存したキャラクターを選んだときは、そのキャラクターの絵 */
  child_character_path?: string | null;
  mom_character_path?: string | null;
  dad_character_path?: string | null;
  /** 写真の顔の飾り（シール・メガネなど）を絵では描かない（写真の画面のチェック。列が無いデータベースでは無い） */
  plain_face?: boolean | null;
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

export function demoDraftId(d: { taste: TasteId; story: string; childName: string; childAge: number | null; hasMom: boolean; hasDad: boolean }) {
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

/** オリジナルのお話の、ほかの登場人物の人数（ペットやおばあちゃんなど）。台本のお話では、足した兄弟姉妹の人数 */
export function draftGuestCount(draft: Pick<Draft, "story">) {
  return Math.min(parseCustomKey(draft.story)?.cast.length ?? parseSeriesKey(draft.story)?.siblings ?? 0, MAX_GUESTS);
}

/** この下書きのプレビューで最初に作る絵の番号（登場する人ごとのキャラクターと表紙）。本文のページ（0〜11）は別に選んで作る */
export function draftPreviewScenes(draft: Draft) {
  const people = draftPeople(draft);
  return previewScenes({ hasMom: people.includes("mom"), hasDad: people.includes("dad"), guests: draftGuestCount(draft) });
}

/** お支払いが済んだ注文がある下書きか（文や写真を変えると、印刷する本が変わってしまうので変えない） */
export async function draftOrdered(draftId: string) {
  const db = getSupabase();
  if (!db || isDemoId(draftId)) return false;
  const { data } = await db.from("orders").select("id").eq("draft_id", draftId).neq("status", "pending").limit(1);
  return !!data?.length;
}

/** この下書きで作ったキャラクターの保存先（作り直すと上書きする） */
export function characterPath(draftId: string, who: Person) {
  return `characters/${draftId}/${who}.png`;
}

/** ほかの登場人物のキャラクターの保存先（下書きの列には入れず、この場所で決まる） */
export function guestCharacterPath(draftId: string, i: number) {
  return `characters/${draftId}/guest${i}.png`;
}

function demoImage(draft: Draft, sceneIndex: number) {
  const taste = getTaste(draft.taste)!;
  const story = getBook(draft.story)!;
  const cover = sceneIndex === COVER_SCENE;
  const who = characterOf(sceneIndex);
  const guest = guestOf(sceneIndex);
  const guestName = guest === null ? "" : (parseCustomKey(draft.story)?.cast[guest]?.name ?? `登場人物${guest + 1}`);
  const scene = cover
    ? { art: story.cover }
    : who
      ? { art: `${PERSON_LABEL[who]}のキャラクター（全身・正面）` }
      : guest !== null
        ? { art: `${guestName}のキャラクター（全身）` }
        : story.scenes[sceneIndex];
  const h = cover ? 683 : 1024;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 ${h}"><rect width="1024" height="${h}" fill="${taste.swatch}"/><circle cx="820" cy="190" r="90" fill="#F6C445"/><path d="M0 760 C 260 640 520 820 1024 700 L1024 1024 L0 1024Z" fill="#ffffff" opacity="0.55"/><text x="512" y="480" font-size="40" text-anchor="middle" fill="#43505C" font-family="sans-serif">[デモ画像] ${cover ? "表紙" : who ? PERSON_LABEL[who] : guest !== null ? escapeXml(guestName) : `場面 ${sceneIndex + 1}`}</text><text x="512" y="540" font-size="26" text-anchor="middle" fill="#43505C" font-family="sans-serif">${escapeXml(scene.art.slice(0, 60))}</text></svg>`;
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

/** 無くてもよい画像（ほかの登場人物の写真・キャラクター）。無ければ null */
async function tryDownload(bucket: string, path: string | null) {
  if (!path) return null;
  return download(bucket, path).catch(() => null);
}

/** この絵に出る、ほかの登場人物（キャラクターの絵なら本人だけ、表紙・本文ならその場面に出る人） */
function guestsIn(book: Book | null, sceneIndex: number): number[] {
  if (!book?.cast?.length) return [];
  if (sceneIndex === COVER_SCENE) return book.coverGuests ?? [];
  return isPageScene(sceneIndex) ? (book.scenes[sceneIndex]?.guests ?? []) : [];
}

/**
 * 1場面の挿絵（またはキャラクターの絵）を作り、表示用のURLを返す。
 * 参考にするのは写真と、作ってあるキャラクターの絵。写真が削除されていても、キャラクターがあれば描ける。
 * redo：作り直しの指示（選択肢と一言）。
 */
export async function generateScene(draft: Draft, sceneIndex: number, quality: Quality, redo?: Redo | null, detail?: Detail, candidate?: LikenessId): Promise<string> {
  const db = getSupabase();
  const ai = getOpenAI();
  if (!db || !ai || isDemoId(draft.id)) return demoImage(draft, sceneIndex);

  if (!photoOf(draft, "child") && !characterPathOf(draft, "child")) {
    throw new Error("写真が見つかりません（削除済みの可能性があります）");
  }

  const target = characterOf(sceneIndex);
  const guest = guestOf(sceneIndex);
  // 兄弟姉妹を足した台本のお話は、書き直した文と絵の指示で描く（兄弟姉妹は「ほかの登場人物」と同じ仕組み）
  const book = await bookForDraft(db, draft);
  const guestPhotos = parseCustomKey(draft.story) ? customPhotos(draft.story) : await siblingPhotos(db, draft.id);
  const images: RefImage[] = [];
  for (const who of target ? [target] : guest !== null ? [] : draftPeople(draft)) {
    const photo = photoOf(draft, who);
    const character = characterPathOf(draft, who);
    if (photo) images.push({ who, kind: "photo", file: await download(PHOTO_BUCKET, photo) });
    if (!character) continue;
    if (!target) images.push({ who, kind: "character", file: await download(BOOK_BUCKET, character) });
    // キャラクターの作り直し：指示があるとき（写真が無いときも）は、今の絵をもとに直す。
    // 「写真そっくり」は前の絵に引っぱられないよう、写真だけから描き直す
    else if (!photo || (!candidate && hasRedoRequest(redo) && redo.likeness !== "exact")) {
      images.push({ who, kind: photo ? "previous" : "character", file: await download(BOOK_BUCKET, character) });
    }
  }
  // ほかの登場人物（オリジナルのお話）：写真と、作ってあるキャラクターの絵。写真を消していても、キャラクターがあれば描ける
  for (const g of guest !== null ? [guest] : guestsIn(book, sceneIndex)) {
    const photo = await tryDownload(PHOTO_BUCKET, guestPhotos[g] ?? null);
    if (photo) images.push({ who: g, kind: "photo", file: photo });
    const keepPrevious = !photo || (!candidate && hasRedoRequest(redo) && redo.likeness !== "exact");
    if (guest !== null && !keepPrevious) continue;
    const character = await tryDownload(BOOK_BUCKET, guestCharacterPath(draft.id, g));
    if (character) images.push({ who: g, kind: guest !== null && photo ? "previous" : "character", file: character });
  }

  // 本文の場面は見開き（横長）で描く（2026-10-15 作道さん：お客様の本も見開き版に）
  const spread = isPageScene(sceneIndex);
  // 注文ごとの特別対応：ママ・パパの代わりにお兄ちゃん・お姉ちゃんなどが出る本
  const standIns = await standInsForDraft(db, draft.id);
  const b64 = await illustrate({ taste: draft.taste, story: draft.story, sceneIndex, images, quality, detail, childAge: draft.child_age, redo, plainFace: !!draft.plain_face, spread, standIns, book });
  const png = Buffer.from(b64, "base64");

  // 会員の写真は「最後に使った日」を更新する（1年使わなければ自動削除）
  const used = [...PEOPLE.map((p) => photoOf(draft, p)), ...guestPhotos].filter((p): p is string => !!p);
  if (draft.user_id && used.length) {
    await db.from("user_photos").update({ last_used_at: new Date().toISOString() }).in("path", used);
  }

  // 3パターンの候補：お客様が選ぶまでは、キャラクターにもプレビューにも使わない
  if (candidate) {
    const path = candidatePath(draft.id, sceneIndex, candidate);
    const { error } = await uploadBookImage(path, png);
    if (error) throw new Error(`画像の保存に失敗しました: ${error.message}`);
    return viewUrl(path);
  }

  if (target) await saveCharacter(draft, target, png);
  if (guest !== null) {
    const { error } = await uploadBookImage(guestCharacterPath(draft.id, guest), png);
    if (error) throw new Error(`キャラクターの保存に失敗しました: ${error.message}`);
  }

  const path = pagePath(draft.id, quality, sceneIndex);
  const { error } = await uploadBookImage(path, png);
  if (error) throw new Error(`画像の保存に失敗しました: ${error.message}`);
  if (spread) await saveSceneSpot(path, png, sceneTextSide(sceneIndex));
  return viewUrl(path);
}

/** キャラクターの3パターン（似せ方 ふつう・しっかり・そっくり）の候補の保存先 */
export function candidatePath(draftId: string, sceneIndex: number, likeness: LikenessId) {
  return `${draftId}/candidates/${sceneIndex}-${likeness}.png`;
}

/** お客様が選んだ候補を、その人のキャラクター（とプレビューの絵）にする。表示用のURLを返す */
export async function pickCandidate(draft: Draft, sceneIndex: number, likeness: LikenessId): Promise<string> {
  const db = getSupabase();
  if (!db || isDemoId(draft.id)) return demoImage(draft, sceneIndex);
  const file = await download(BOOK_BUCKET, candidatePath(draft.id, sceneIndex, likeness));
  const png = Buffer.from(await file.arrayBuffer());
  const target = characterOf(sceneIndex);
  const guest = guestOf(sceneIndex);
  if (target) await saveCharacter(draft, target, png);
  if (guest !== null) {
    const { error } = await uploadBookImage(guestCharacterPath(draft.id, guest), png);
    if (error) throw new Error(`キャラクターの保存に失敗しました: ${error.message}`);
  }
  const path = pagePath(draft.id, "preview", sceneIndex);
  const { error } = await uploadBookImage(path, png);
  if (error) throw new Error(`画像の保存に失敗しました: ${error.message}`);
  return viewUrl(path);
}

/** 見開きの絵を見て、文を置く場所（人物・動物のいない所）をAIに選んでもらい、絵の隣に JSON で保存する（約1円） */
async function saveSceneSpot(path: string, png: Buffer, side: "left" | "right") {
  const db = getSupabase()!;
  const spot = await findSpreadTextSpot(png, side);
  const { error } = await db.storage.from(BOOK_BUCKET).upload(sceneSpotPath(path), JSON.stringify({ spot }), { contentType: "application/json", upsert: true });
  if (error) console.error("scene text spot save failed", path, error);
}

/** キャラクターの絵を保存し、下書きに結びつける（会員はマイページの「保存しているキャラクター」にも入る）。 */
async function saveCharacter(draft: Draft, who: Person, png: Buffer) {
  const db = getSupabase()!;
  const path = characterPath(draft.id, who);
  const { error } = await uploadBookImage(path, png);
  if (error) throw new Error(`キャラクターの保存に失敗しました: ${error.message}`);
  draft[`${who}_character_path`] = path;
  const { error: draftError } = await db.from("drafts").update({ [`${who}_character_path`]: path }).eq("id", draft.id);
  if (draftError) console.error("draft character update failed", draftError);
  // ママ・パパの欄を兄弟姉妹に入れ替えた人は、マイページの「ママ」「パパ」のキャラクターとしては残さない
  const sibling = who !== "child" && !!(await loadFamily(db, draft.id))[who];
  if (draft.user_id && !sibling) await rememberCharacters(draft.user_id, [{ who, path, taste: draft.taste, childName: draft.child_name }]);
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
    const { error } = await copyBookImage(from, pagePath(draft.id, "preview", CHARACTER_SCENES[who]));
    if (error) console.error("character copy failed", error);
  }
}

/** 作成済みのプレビューの絵（場面番号→一時URL） */
export async function previewUrls(draftId: string): Promise<Record<number, string>> {
  const db = getSupabase();
  if (!db || isDemoId(draftId)) return {};
  const { data: files } = await db.storage.from(BOOK_BUCKET).list(`${draftId}/preview`);
  const paths = (files ?? []).map((f) => `${draftId}/preview/${f.name}`).filter((p) => !isViewPath(p));
  if (!paths.length) return {};
  const urls = await viewUrls(paths);
  const out: Record<number, string> = {};
  for (const [path, url] of urls) {
    const m = path.match(/\/(\d+)\.png$/);
    if (m) out[Number(m[1])] = url;
  }
  return out;
}

/**
 * 注文の印刷用の絵を、プレビューで作った同じページの絵から作る（お客様がプレビューで確かめた絵をそのまま本にする。2026-10-12 作道さん）。
 * 本文は印刷の大きさに拡大し、表紙はそのまま使う。プレビューに無いページは null（新しく描く）。
 */
export async function finalFromPreview(draft: Draft, sceneIndex: number): Promise<string | null> {
  const db = getSupabase();
  if (!db || isDemoId(draft.id) || (sceneIndex !== COVER_SCENE && !isPageScene(sceneIndex))) return null;
  const { data } = await db.storage.from(BOOK_BUCKET).download(pagePath(draft.id, "preview", sceneIndex));
  if (!data) return null;
  const original = Buffer.from(await data.arrayBuffer());
  const b64 = original.toString("base64");
  const wide = sceneIndex !== COVER_SCENE && (await isWideImage(original));
  const png = Buffer.from(sceneIndex === COVER_SCENE ? b64 : await upscaleForPrint(b64, wide), "base64");
  const path = pagePath(draft.id, "final", sceneIndex);
  const { error } = await uploadBookImage(path, png);
  if (error) throw new Error(`画像の保存に失敗しました: ${error.message}`);
  // 見開きの絵は、プレビューで選んだ文の置き場所もそのまま使う（無ければ選び直す）
  if (wide) {
    // コピーは上書きできないので、前の注文の絵づくりで置いた分を先に消す
    await db.storage.from(BOOK_BUCKET).remove([sceneSpotPath(path)]);
    const { error: copyError } = await db.storage.from(BOOK_BUCKET).copy(sceneSpotPath(pagePath(draft.id, "preview", sceneIndex)), sceneSpotPath(path));
    if (copyError) await saveSceneSpot(path, original, sceneTextSide(sceneIndex));
  }
  return viewUrl(path);
}

/** プレビューの表紙と本文の絵を消す（登場人物を直すとき。古いキャラクターで描いた絵が本に使われないように） */
export async function deletePreviewBook(draftId: string) {
  const db = getSupabase();
  if (!db || isDemoId(draftId)) return;
  const scenes = [COVER_SCENE, ...Array.from({ length: BOOK_SCENE_COUNT }, (_, i) => i)];
  const paths = scenes.map((i) => pagePath(draftId, "preview", i));
  const { error } = await db.storage.from(BOOK_BUCKET).remove([...withViews(paths), ...paths.map(sceneSpotPath)]);
  if (error) throw new Error(`絵の削除に失敗しました: ${error.message}`);
}

/** 注文の確認画面でアップロードした「思い出の写真」の置き場所（PHOTO_BUCKET） */
export function memoryPhotoDir(draftId: string) {
  return `memory/${draftId}`;
}

/** 下書きの絵（プレビューと本番）と、思い出の写真をすべて削除する。 */
export async function deleteDraftImages(draftId: string) {
  const db = getSupabase();
  if (!db) return;
  const { data: memory } = await db.storage.from(PHOTO_BUCKET).list(memoryPhotoDir(draftId));
  const memoryPaths = (memory ?? []).map((f) => `${memoryPhotoDir(draftId)}/${f.name}`);
  if (memoryPaths.length) {
    const { error } = await db.storage.from(PHOTO_BUCKET).remove(memoryPaths);
    if (error) throw new Error(`思い出の写真の削除に失敗しました: ${error.message}`);
  }
  for (const quality of ["preview", "final", "candidates"] as const) {
    const { data: files } = await db.storage.from(BOOK_BUCKET).list(`${draftId}/${quality}`);
    const paths = (files ?? []).map((f) => `${draftId}/${quality}/${f.name}`);
    if (paths.length) {
      const { error } = await db.storage.from(BOOK_BUCKET).remove(paths);
      if (error) throw new Error(`絵の削除に失敗しました: ${error.message}`);
    }
  }
  await db.from("drafts").update({ images_deleted_at: new Date().toISOString() }).eq("id", draftId);
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
  const { error: charError } = await db.storage
    .from(BOOK_BUCKET)
    .remove(withViews([...PEOPLE.map((p) => characterPath(draft.id, p)), ...Array.from({ length: MAX_GUESTS }, (_, i) => guestCharacterPath(draft.id, i))]));
  if (charError) throw new Error(`キャラクターの削除に失敗しました: ${charError.message}`);
  await db
    .from("drafts")
    .update({ child_photo_path: null, mom_photo_path: null, dad_photo_path: null, photos_deleted_at: new Date().toISOString() })
    .eq("id", draft.id);
  await db.from("drafts").update({ child_character_path: null, mom_character_path: null, dad_character_path: null }).eq("id", draft.id);
}
