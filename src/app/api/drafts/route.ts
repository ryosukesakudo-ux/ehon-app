import { randomUUID } from "node:crypto";
import { ANON_TRIAL_IP_DAYS, CHILD_AGES, getTaste, previewScenes, type Person, type TasteId } from "@/lib/catalog";
import { isPublished } from "@/lib/published-episodes";
import { comboOf, getSeriesInfo, isStoryKey, parseSeriesKey, seriesKey, withoutCombo } from "@/lib/story-key";
import { outfitOk } from "@/lib/outfit-choice";
import { readyEpisodes } from "@/lib/series-studio";
import { copySavedCharacters, demoDraftId, previewUrls, type Draft } from "@/lib/drafts";
import { currentUser } from "@/lib/auth";
import { ensureAnonId, ipHash } from "@/lib/anon";
import { PHOTO_BUCKET, getSupabase } from "@/lib/services";
import { faceFromField, faceToPathTag } from "@/lib/face";
import { customKeyWithPhotos, customStoryComplete, parseCustomKey } from "@/lib/custom-story";
import { storyTextFlagged, verifyStory } from "@/lib/custom-story-server";
import { parseFamily, saveFamily } from "@/lib/stand-ins";
import { parseSiblings, saveSiblingsWithRewrite } from "@/lib/siblings";

// 兄弟姉妹を足したときは、台本の文をAIで書き直すので時間に余裕を持たせる
export const maxDuration = 300;

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function bad(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

// 写真ページの「絵本をつくる」で呼ぶ。下書きを作り、顔写真を非公開ストレージに保存する。
// 会員は保存済みの写真（childPhotoId / momPhotoId / dadPhotoId）や、
// 前に作ったキャラクター（childCharacterId / momCharacterId / dadCharacterId）も選べる。
// 会員でない場合は、ブラウザごと・IPアドレスごとに1回だけお試しできる。
export async function POST(request: Request) {
  const form = await request.formData();
  const taste = String(form.get("taste") ?? "");
  const story = withoutCombo(String(form.get("story") ?? ""));
  const childName = String(form.get("childName") ?? "").trim();
  const childAge = Number(form.get("childAge"));
  const consent = form.get("consent") === "true";
  const plainFace = form.get("plainFace") === "true";
  // ママ・パパの欄に入れた兄弟姉妹（2026-10-19）。その欄の写真があるときだけ使う
  const family = parseFamily((() => {
    try {
      return JSON.parse(String(form.get("family") ?? "{}"));
    } catch {
      return {};
    }
  })());
  const childPhoto = form.get("childPhoto");
  // ママ・パパが出ないお話（プリンセス）は、ママ・パパの写真を受け取らない
  const noParents = !!getSeriesInfo(parseSeriesKey(story)?.series ?? "")?.noParents;
  const momPhoto = noParents ? null : form.get("momPhoto");
  const dadPhoto = noParents ? null : form.get("dadPhoto");
  const childPhotoId = String(form.get("childPhotoId") ?? "");
  const momPhotoId = noParents ? "" : String(form.get("momPhotoId") ?? "");
  const dadPhotoId = noParents ? "" : String(form.get("dadPhotoId") ?? "");
  const characterIds: Record<Person, string> = {
    child: String(form.get("childCharacterId") ?? ""),
    mom: noParents ? "" : String(form.get("momCharacterId") ?? ""),
    dad: noParents ? "" : String(form.get("dadCharacterId") ?? ""),
  };

  if (!getTaste(taste) || !isStoryKey(story)) return bad("テイストとお話を選んでください");
  // シリーズのお話は、見本の絵がそろった話だけ選べる。1話だけのお話は 2026-10-11 から非表示（新しくは作れない）
  const series = parseSeriesKey(story);
  // オリジナルのお話は、絵の内容がサーバーで作ったままで、文がそろっていて、ふさわしくない言葉がないこと
  const custom = parseCustomKey(story);
  if (custom) {
    if (!verifyStory(custom)) return bad("お話を読み込めませんでした。お話をもう一度作ってください");
    if (!customStoryComplete(custom)) return bad("題名と全ページの文を入れてください");
    if (await storyTextFlagged(custom).catch(() => false)) return bad("絵本にふさわしくない言葉が含まれているようです。文を直してください");
  } else if (!series) return bad("このお話は今はお選びいただけません。お話を選び直してください");
  else if (!(await isPublished(series.series, series.episode)) || !(await readyEpisodes())[series.series].includes(series.episode)) return bad("このお話はまだ準備中です。ほかのお話を選んでください");
  else if (!(await outfitOk(series.series, series.outfit))) return bad("服の形と色を選んでください");
  if (!childName || childName.length > 12) return bad("名前は12文字以内で入力してください");
  if (!CHILD_AGES.includes(childAge)) return bad("お子さまの年齢を選んでください");
  // 台本のお話に足す兄弟姉妹（最大2人・会員だけ。写真は guest0Photo… で受け取る）
  const siblingInput = series ? parseSiblings((() => {
    try {
      return JSON.parse(String(form.get("siblings") ?? "[]"));
    } catch {
      return [];
    }
  })()) : [];
  // オリジナルのお話の、ほかの登場人物の写真（guest0Photo…・会員は保存している写真 guest0PhotoId… も）
  const guestCount = custom?.cast.length ?? siblingInput.length;
  const guestPhotos = Array.from({ length: guestCount }, (_, i) => form.get(`guest${i}Photo`));
  const guestPhotoIds = Array.from({ length: guestCount }, (_, i) => String(form.get(`guest${i}PhotoId`) ?? ""));
  for (const f of [childPhoto, momPhoto, dadPhoto, ...guestPhotos]) {
    if (!(f instanceof File)) continue;
    if (!PHOTO_TYPES[f.type]) return bad("写真は JPEG・PNG・WebP でアップロードしてください");
    if (f.size > MAX_PHOTO_BYTES) return bad("写真は10MB以下にしてください");
  }
  const newUpload = [childPhoto, momPhoto, dadPhoto, ...guestPhotos].some((f) => f instanceof File);
  if (newUpload && !consent) return bad("写真の取り扱いへの同意が必要です");

  const db = getSupabase();
  if (!db) {
    if (!(childPhoto instanceof File)) return bad("お子さまの写真を選んでください");
    const demoId = demoDraftId({
      taste: taste as TasteId,
      story: series ? seriesKey(series.series, series.episode, series.level, comboOf(momPhoto instanceof File, dadPhoto instanceof File), 0, series.outfit) : story,
      childName,
      childAge,
      hasMom: momPhoto instanceof File,
      hasDad: dadPhoto instanceof File,
    });
    return Response.json({
      draftId: demoId,
      demo: true,
      previewScenes: previewScenes({ hasMom: momPhoto instanceof File, hasDad: dadPhoto instanceof File, guests: custom?.cast.length ?? 0 }),
    });
  }

  const user = await currentUser();
  const id = randomUUID();
  // 兄弟姉妹は会員だけ（登録前のお試しでは足さない）
  const siblings = user ? siblingInput : [];

  const upload = async (f: File, who: string) => {
    // 顔を囲んだ位置はファイル名に入れておく（保存した写真を見返したとき、どの人を選んだか分かるように）
    const tag = faceToPathTag(faceFromField(form.get(`${who}Face`)));
    const path = user
      ? `users/${user.id}/${randomUUID()}${tag}.${PHOTO_TYPES[f.type]}`
      : `anon/${id}/${who}${tag}.${PHOTO_TYPES[f.type]}`;
    const { error } = await db.storage
      .from(PHOTO_BUCKET)
      .upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type });
    if (error) throw new Error(error.message);
    if (user) {
      const { error: rowError } = await db.from("user_photos").insert({ user_id: user.id, path });
      if (rowError) throw new Error(rowError.message);
    }
    return path;
  };

  // 会員の保存済み写真（本人のものだけ）
  const saved = async (photoId: string) => {
    if (!user || !photoId) return null;
    const { data } = await db.from("user_photos").select("path").eq("id", photoId).eq("user_id", user.id).maybeSingle();
    return data?.path ?? null;
  };

  // 会員の保存済みキャラクター（本人のものだけ）
  const characters: Partial<Record<Person, { path: string; taste: string }>> = {};
  if (user) {
    for (const who of ["child", "mom", "dad"] as const) {
      if (!characterIds[who]) continue;
      const { data } = await db
        .from("characters")
        .select("path, taste, person")
        .eq("id", characterIds[who])
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.person === who) characters[who] = { path: data.path, taste: data.taste };
    }
  }

  let hasMom = false;
  let hasDad = false;
  let previews: Record<number, string> = {};
  try {
    const childPath = childPhoto instanceof File ? await upload(childPhoto, "child") : await saved(childPhotoId);
    if (!childPath && !characters.child) return bad("お子さまの写真を選んでください");

    let anonId: string | null = null;
    if (!user) {
      anonId = await ensureAnonId();
      const { data: allowed, error } = await db.rpc("claim_anon_trial", {
        p_anon: anonId,
        p_ip: ipHash(request),
        p_ip_days: ANON_TRIAL_IP_DAYS,
      });
      if (error) throw new Error(error.message);
      if (!allowed) {
        if (childPath) await db.storage.from(PHOTO_BUCKET).remove([childPath]);
        return Response.json(
          { error: "登録なしのお試しは1回までです。続きは無料の会員登録でご利用いただけます。", needLogin: true },
          { status: 403 },
        );
      }
    }

    const momPath = momPhoto instanceof File ? await upload(momPhoto, "mom") : await saved(momPhotoId);
    const dadPath = dadPhoto instanceof File ? await upload(dadPhoto, "dad") : await saved(dadPhotoId);
    hasMom = !!momPath || !!characters.mom;
    hasDad = !!dadPath || !!characters.dad;
    // ほかの登場人物の写真の保存先は、お話の中に入れておく（データベースの列を増やさずに済むように。お客様が送ったお話の中の値は使わない）
    const guestPaths: (string | null)[] = [];
    for (let i = 0; i < guestCount; i++) {
      const f = guestPhotos[i];
      // オリジナルのお話は会員だけ（登録前のお試しの写真は自動削除の対象が決まっているので、ここでは受け取らない）
      if (!user) {
        guestPaths.push(null);
        continue;
      }
      guestPaths.push(f instanceof File ? await upload(f, `guest${i}`) : await saved(guestPhotoIds[i]));
    }
    const base = {
      id,
      user_id: user?.id ?? null,
      anon_id: anonId,
      taste,
      // シリーズは写真の組み合わせを足して保存する（写真を消したあとも、同じ本文で印刷できるように）
      story: series ? seriesKey(series.series, series.episode, series.level, comboOf(hasMom, hasDad), siblings.length, series.outfit) : custom ? customKeyWithPhotos(custom, guestPaths) : story,
      child_name: childName,
      child_age: childAge,
      child_photo_path: childPath,
      mom_photo_path: momPath,
      dad_photo_path: dadPath,
      // 列が無い（SQL 未実行の）データベースでも写真だけの下書きは作れるよう、選んだときだけ入れる
      ...(characters.child && { child_character_path: characters.child.path }),
      ...(characters.mom && { mom_character_path: characters.mom.path }),
      ...(characters.dad && { dad_character_path: characters.dad.path }),
    };
    const row = plainFace ? { ...base, plain_face: true } : base;
    let { error } = await db.from("drafts").insert(row);
    if (error && plainFace && /plain_face/.test(error.message)) {
      // 列が無い（schema.sql 未実行の）データベース：飾りを消す指定なしで作る
      console.error("drafts.plain_face column missing; run schema.sql", error);
      ({ error } = await db.from("drafts").insert(base));
    }
    if (error) throw new Error(error.message);
    if (!hasMom) delete family.mom;
    if (!hasDad) delete family.dad;
    if (Object.keys(family).length) await saveFamily(db, id, family);
    if (siblings.length) await saveSiblingsWithRewrite(db, id, base.story, siblings.map((s, i) => ({ ...s, photo: guestPaths[i] ?? null })));
    // 同じテイストで作ったキャラクターは、そのままプレビューに使う（違うテイストは描き直す）
    const sameTaste = (["child", "mom", "dad"] as const).filter((who) => characters[who]?.taste === taste);
    if (sameTaste.length) {
      await copySavedCharacters({ ...row, generation_count: 0, photos_deleted_at: null, images_deleted_at: null } as Draft, sameTaste);
      previews = await previewUrls(id);
    }
  } catch (e) {
    console.error("draft create failed", e);
    return Response.json({ error: "写真の保存に失敗しました。もう一度お試しください" }, { status: 500 });
  }

  return Response.json({
    draftId: id,
    member: !!user,
    previews,
    previewScenes: previewScenes({ hasMom, hasDad, guests: custom ? guestCount : siblings.length }),
  });
}
