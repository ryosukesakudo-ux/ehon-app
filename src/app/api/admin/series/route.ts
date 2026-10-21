import { toFile } from "openai";
import { calledName, isHonorificId, sceneText, type HonorificId } from "@/lib/catalog";
import { getBook } from "@/lib/book";
import { illustrateSeries, makeOwnSeriesSheet, makeSeriesCharacter, makeSeriesFamilyPhoto, makeSeriesFamilyPhotoFromText, makeSeriesSheet, makeSeriesSidekick } from "@/lib/illustrate";
import { characterSheetPath, samplePublicUrl } from "@/lib/samples";
import {
  SPREAD_TEXT_SPOTS,
  ownBookPdfPath,
  ownBookSpreadPath,
  ownBookSpreadTextPath,
  ownBookViewPath,
  ownCharacterPath,
  ownCoverPath,
  ownPhotoPath,
  ownSheetPath,
  seriesBookPdfPath,
  seriesBookSpreadPath,
  seriesBookSpreadTextPath,
  seriesBookViewPath,
  seriesCharacterPath,
  seriesFamilyPhotoPath,
  seriesImagePath,
  seriesImageTextPath,
  seriesSceneTextSide,
  seriesSampleChildName,
  seriesSheetPath,
  seriesSidekickPath,
  seriesSpreadPath,
  sidekickShortName,
  seriesSpreadTextPath,
  usesShowcasePhoto,
  type SpreadTextSpot,
} from "@/lib/series";
import { buildSpreadBook } from "@/lib/spread-book";
import { findSpreadTextSpot, isSpotDark } from "@/lib/spread-text";
import { episodeArtComplete, getStudioSeries, studioScenesFor } from "@/lib/series-studio";
import { setPublished } from "@/lib/published-episodes";
import { readScriptEdits } from "@/lib/script-edits";
import { BOOK_BUCKET, SAMPLE_BUCKET, getSupabase } from "@/lib/services";
import { SHOWN_SERIES_LIST, bookTitle, seriesKey, type Combo, type LevelId } from "@/lib/story-key";

const COMBOS: Combo[] = ["both", "mom", "dad", "none"];
const PEOPLE = ["child", "mom", "dad"] as const;
type Who = (typeof PEOPLE)[number];
/** 主人公の名前の最大文字数（絵スタジオで入力する見本の名前） */
const NAME_MAX = 12;
const LEVEL_IDS: LevelId[] = ["s", "n", "l"];
/** 見開き版の本で、文を置くページ（絵を描くときに空けておくページ）。場面ごとに右・左を交互にして、絵の構図に変化をつける */
const bookTextSide = seriesSceneTextSide;

export const maxDuration = 300;

// 台本の絵スタジオから呼ぶ。作例の家族でシリーズの絵を1枚作り、公開ストレージ（samples）に保存する。
// note：その絵だけに効く追加の指示（日本語でよい）。
// kind=sheet：シリーズの設定画（作例の設定画＋相棒） / kind=photo：サンプル集に出す、設定画の家族そっくりの架空の家族写真
// （写真が先のシリーズは逆：photo を文章から先に作り、sheet と場面はその写真に寄せる） / それ以外：その話の表紙（page=0）か場面（1〜12）
// spread=true：場面を見開き（横長）で描く試作。今の場面の絵とは別の場所に保存する。textSide のページを空けて描き、
// できた絵をAIが見て文の置き場所（人物・動物のいない所）を決めて、隣にJSONで保存する
// kind=spreadText：今ある見開きの絵で、文の置き場所だけ選び直す
// wide=true：各話の見本の場面（表紙以外）を横長の見開きで描く / kind=publish：その話を本番に出す（published=true）・取り下げる
// 見開き版の本の試作（combo＝写真の組み合わせ both / mom / dad / none）：
// kind=bookChara：登場人物しょうかい用に、ひとり分（who）のキャラクターの絵を作る。who=sidekick は相棒（シリーズに1枚、見本の設定画から描いて公開の samples に置く） / kind=bookSpread：その組み合わせの場面（page 1〜12）を見開きで描く
// kind=bookRender：表紙から最後のページまでを見開きごとの画像とPDFにする（level＝文の量 s / n / l）。できた画像とPDFのURLを返す
// own=true：「自分の写真で試す」。写真（kind=ownPhoto、フォームで送る）と、その写真から描いた絵を非公開の books に保存する。
// kind=ownList：今ある写真と絵の、期限付きのURLを返す / kind=ownCover：その話の表紙を写真の家族で描く
// bookRender は name（主人公の名前）と honorific（呼び方）で本の文を組む
export async function POST(request: Request) {
  if (request.headers.get("content-type")?.includes("multipart/form-data")) return saveOwnPhoto(request);
  const body = await request.json().catch(() => null);
  const series = getStudioSeries(String(body?.series ?? ""));
  if (!series) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定のため、絵を保存できません" }, { status: 503 });

  const own = body?.own === true;
  // 自分の写真の絵は非公開の books、見本の家族の絵は公開の samples
  const bucket = own ? BOOK_BUCKET : SAMPLE_BUCKET;
  const load = async (path: string, name: string, from = SAMPLE_BUCKET) => {
    const { data, error } = await db.storage.from(from).download(path);
    return error || !data ? null : toFile(data, name, { type: "image/png" });
  };
  const save = async (path: string, b64: string) => {
    const { error } = await db.storage
      .from(bucket)
      .upload(path, Buffer.from(b64, "base64"), { contentType: "image/png", upsert: true, cacheControl: "300" });
    if (error) throw new Error(error.message);
  };

  const saveSpot = async (episode: number, page: number, png: Buffer, side: "left" | "right") => {
    const spot = await findSpreadTextSpot(png, side);
    // 文字の後ろが暗いときだけ、見え方で薄い白を敷く
    const dark = spot !== "none" && (await isSpotDark(png, spot));
    const { error } = await db.storage
      .from(SAMPLE_BUCKET)
      .upload(seriesSpreadTextPath(series.id, episode, page), JSON.stringify({ spot, dark }), { contentType: "application/json", upsert: true, cacheControl: "300" });
    if (error) throw new Error(error.message);
  };
  const textSide = body?.textSide === "left" ? "left" : "right";

  const note = typeof body?.note === "string" ? body.note.trim() : "";
  const noPhoto = usesShowcasePhoto(series.id) ? "先に作例スタジオで「この写真から → この絵本に」の①（家族の写真）を作ってください" : "先に家族写真を作ってください";

  // 自分の写真（いる人だけ）と、その写真から描く設定画（無ければ先に作る）
  const ownPhotos = async (people: readonly Who[]) =>
    (await Promise.all(people.map(async (who) => ({ who, file: await load(ownPhotoPath(who), `${who}.jpg`, BOOK_BUCKET) })))).filter(
      (p): p is { who: Who; file: NonNullable<typeof p.file> } => !!p.file,
    );
  const ownSheet = async () => {
    const existing = await load(ownSheetPath(series.id), "characters.png", BOOK_BUCKET);
    if (existing) return existing;
    const photos = await ownPhotos(PEOPLE);
    if (!photos.some((p) => p.who === "child")) throw new Error("先に主人公の写真を選んでください");
    const b64 = await makeOwnSeriesSheet(series, photos);
    await save(ownSheetPath(series.id), b64);
    return toFile(Buffer.from(b64, "base64"), "characters.png", { type: "image/png" });
  };

  try {
    if (body?.kind === "ownList") {
      const episode = series.episodes.find((e) => e.no === Number(body?.episode));
      const combo = COMBOS.find((c) => c === body?.combo);
      if (!episode || !combo) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
      const paths = [
        ...PEOPLE.map(ownPhotoPath),
        ownSheetPath(series.id),
        ownCoverPath(series.id, episode.no),
        ...PEOPLE.map((w) => ownCharacterPath(series.id, episode.no, w)),
        ...episode.scenes.map((_, i) => ownBookSpreadPath(series.id, episode.no, combo, i + 1)),
      ];
      return Response.json({ ok: true, urls: await signedUrls(db, paths) });
    }

    if (own && body?.kind === "ownSheet") {
      // 写真から設定画を描き直す（写真を変えたときは自動で消えるので、ふつうは「まとめて作る」が先に作る）
      const photos = await ownPhotos(PEOPLE);
      if (!photos.some((p) => p.who === "child")) return Response.json({ error: "先に主人公の写真を選んでください" }, { status: 400 });
      await save(ownSheetPath(series.id), await makeOwnSeriesSheet(series, photos, note));
      return Response.json({ ok: true });
    }

    if (own && body?.kind === "ownCover") {
      if (!(await ownPhotos(["child"])).length) return Response.json({ error: "先に主人公の写真を選んでください" }, { status: 400 });
      const episode = series.episodes.find((e) => e.no === Number(body?.episode));
      if (!episode) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
      const scene = episode.cover;
      const people: Who[] = ["child", ...(scene.withMom ? (["mom"] as const) : []), ...(scene.withDad ? (["dad"] as const) : [])];
      const quality = body?.quality === "preview" ? "preview" : "final";
      const b64 = await illustrateSeries({ series, scene, page: 0, outfits: episode.outfits, continuity: episode.continuity, note, quality, sheet: await ownSheet(), ownPhotos: await ownPhotos(people) });
      await save(ownCoverPath(series.id, episode.no), b64);
      return Response.json({ ok: true });
    }

    if (body?.kind === "photo" && usesShowcasePhoto(series.id)) {
      // トップの写真と共用（作例スタジオで作る）。ここで作るとトップの写真まで変わってしまう
      return Response.json({ error: "このシリーズの家族写真は、作例スタジオの「この写真から → この絵本に」①を使います。作り直すときは作例スタジオで作ってください" }, { status: 400 });
    }

    if (series.photoFirst && body?.kind === "photo") {
      // 写真が先のシリーズ：家族写真を文章から作る（設定画と場面はこの写真に寄せる）
      await save(seriesFamilyPhotoPath(series.id), await makeSeriesFamilyPhotoFromText(series, note));
      return Response.json({ ok: true });
    }

    if (series.photoFirst && body?.kind === "sheet") {
      const photo = await load(seriesFamilyPhotoPath(series.id), "family-photo.png");
      if (!photo) return Response.json({ error: noPhoto }, { status: 400 });
      await save(seriesSheetPath(series.id), await makeSeriesSheet(series, null, note, photo));
      return Response.json({ ok: true });
    }

    if (body?.kind === "sheet") {
      // 作例スタジオに家族の設定画があるお話はそれに相棒を足す。無いシリーズ（海・恐竜）は文章から描く
      const family = series.familyStory ? await load(characterSheetPath(series.familyStory), "family.png") : null;
      if (series.familyStory && !family) return Response.json({ error: "先に作例スタジオで、このお話のキャラクター設定画を作ってください" }, { status: 400 });
      await save(seriesSheetPath(series.id), await makeSeriesSheet(series, family, note));
      return Response.json({ ok: true });
    }

    if (body?.kind === "photo") {
      const sheet = await load(seriesSheetPath(series.id), "characters.png");
      if (!sheet) return Response.json({ error: "先に登場人物の設定画を作ってください" }, { status: 400 });
      await save(seriesFamilyPhotoPath(series.id), await makeSeriesFamilyPhoto(sheet, note));
      return Response.json({ ok: true });
    }

    const episode = series.episodes.find((e) => e.no === Number(body?.episode));
    const page = Number(body?.page);
    const combo = COMBOS.find((c) => c === body?.combo);

    if (body?.kind === "bookChara" && body?.who === "sidekick") {
      // 相棒は写真に関係なく見本の設定画から描く（自分の写真の本でも同じ絵を使う）
      const sheet = await load(seriesSheetPath(series.id), "characters.png");
      if (!sheet) return Response.json({ error: "先に登場人物の設定画（見本の家族）を作ってください" }, { status: 400 });
      const b64 = await makeSeriesSidekick({ series, sheet, note });
      const { error } = await db.storage
        .from(SAMPLE_BUCKET)
        .upload(seriesSidekickPath(series.id), Buffer.from(b64, "base64"), { contentType: "image/png", upsert: true, cacheControl: "300" });
      if (error) throw new Error(error.message);
      return Response.json({ ok: true });
    }

    if (body?.kind === "bookChara") {
      const who = (["child", "mom", "dad"] as const).find((w) => w === body?.who);
      if (!episode || !who) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
      if (own) {
        const [photo] = await ownPhotos([who]);
        if (!photo) return Response.json({ error: "先にこの人の写真を選んでください" }, { status: 400 });
        const b64 = await makeSeriesCharacter({ series, who, outfits: episode.outfits, sheet: await ownSheet(), ownPhoto: photo.file, note });
        await save(ownCharacterPath(series.id, episode.no, who), b64);
        return Response.json({ ok: true });
      }
      const sheet = await load(seriesSheetPath(series.id), "characters.png");
      if (!sheet) return Response.json({ error: "先に登場人物の設定画を作ってください" }, { status: 400 });
      const photo = series.photoFirst ? await load(seriesFamilyPhotoPath(series.id), "family-photo.png") : null;
      await save(seriesCharacterPath(series.id, episode.no, who), await makeSeriesCharacter({ series, who, outfits: episode.outfits, sheet, photo, note }));
      return Response.json({ ok: true });
    }

    if (body?.kind === "bookSpread") {
      const scene = episode && combo && Number.isInteger(page) ? studioScenesFor(series.id, episode.no, combo)?.[page - 1] : null;
      if (!episode || !combo || !scene) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
      const side = bookTextSide(page);
      const quality = body?.quality === "preview" ? "preview" : "final";
      let b64: string;
      if (own) {
        const people: Who[] = ["child", ...(scene.withMom ? (["mom"] as const) : []), ...(scene.withDad ? (["dad"] as const) : [])];
        const photos = await ownPhotos(people);
        const lacking = people.filter((w) => !photos.some((p) => p.who === w));
        if (lacking.length) return Response.json({ error: `この場面に出る人の写真がありません（${lacking.map((w) => WHO_LABEL[w]).join("・")}）` }, { status: 400 });
        b64 = await illustrateSeries({ series, scene, page, outfits: episode.outfits, continuity: episode.continuity, note, quality, sheet: await ownSheet(), ownPhotos: photos, spread: true, textSide: side });
      } else {
        const sheet = await load(seriesSheetPath(series.id), "characters.png");
        if (!sheet) return Response.json({ error: "先に登場人物の設定画を作ってください" }, { status: 400 });
        const photo = series.photoFirst ? await load(seriesFamilyPhotoPath(series.id), "family-photo.png") : null;
        if (series.photoFirst && !photo) return Response.json({ error: noPhoto }, { status: 400 });
        b64 = await illustrateSeries({ series, scene, page, outfits: episode.outfits, continuity: episode.continuity, note, quality, sheet, photo, spread: true, textSide: side });
      }
      await save((own ? ownBookSpreadPath : seriesBookSpreadPath)(series.id, episode.no, combo, page), b64);
      const spot = await findSpreadTextSpot(Buffer.from(b64, "base64"), side);
      const { error } = await db.storage
        .from(bucket)
        .upload((own ? ownBookSpreadTextPath : seriesBookSpreadTextPath)(series.id, episode.no, combo, page), JSON.stringify({ spot }), { contentType: "application/json", upsert: true, cacheControl: "300" });
      if (error) throw new Error(error.message);
      return Response.json({ ok: true });
    }

    if (body?.kind === "bookRender") {
      const level = LEVEL_IDS.find((l) => l === body?.level) ?? "n";
      if (!episode || !combo) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
      const name = typeof body?.name === "string" ? body.name.trim().slice(0, NAME_MAX) : "";
      const honorific = isHonorificId(body?.honorific) ? body.honorific : null;
      const result = await renderBook(db, series.id, episode.no, combo, level, { own, name, honorific });
      if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
      return Response.json({ ok: true, ...result });
    }

    if (body?.kind === "publish") {
      // 本番に出す（お客様が注文できるようにする）・取り下げる。出すのは表紙と12場面がそろった話だけ
      if (!episode) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
      const on = body?.published === true;
      if (on && !(await episodeArtComplete(series.id, episode.no))) return Response.json({ error: "表紙と12場面の13枚がそろってから本番に出せます" }, { status: 400 });
      const published = await setPublished(series.id, episode.no, on);
      return Response.json({ ok: true, published: published[series.id] });
    }

    if (body?.kind === "spreadText") {
      if (!episode || !Number.isInteger(page) || page < 1) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
      const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(seriesSpreadPath(series.id, episode.no, page));
      if (error || !data) return Response.json({ error: "先に見開きの絵を作ってください" }, { status: 400 });
      await saveSpot(episode.no, page, Buffer.from(await data.arrayBuffer()), textSide);
      return Response.json({ ok: true });
    }

    const scene = !episode || !Number.isInteger(page) ? null : page === 0 ? episode.cover : episode.scenes[page - 1];
    if (!episode || !scene) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
    const sheet = await load(seriesSheetPath(series.id), "characters.png");
    if (!sheet) return Response.json({ error: "先に登場人物の設定画を作ってください" }, { status: 400 });
    const photo = series.photoFirst ? await load(seriesFamilyPhotoPath(series.id), "family-photo.png") : null;
    if (series.photoFirst && !photo) return Response.json({ error: noPhoto }, { status: 400 });
    const quality = body?.quality === "preview" ? "preview" : "final";
    const spread = body?.spread === true;
    if (spread && page === 0) return Response.json({ error: "見開きの試作は場面（1〜12）だけです" }, { status: 400 });
    // wide=true：各話の見本の場面を横長（見開き）で描く（2026-10-16 作道さん）。お客様の本と同じく文を置くページを右・左交互に空け、
    // 文の置き場所をAIに選ばせて隣にJSONで保存する。表紙はもともと横長
    const wide = !spread && body?.wide === true && page > 0;
    const side = wide ? seriesSceneTextSide(page) : textSide;
    const b64 = await illustrateSeries({ series, scene, page, outfits: episode.outfits, continuity: episode.continuity, note, quality, sheet, photo, spread: spread || wide, textSide: side });
    await save(spread ? seriesSpreadPath(series.id, episode.no, page) : seriesImagePath(series.id, episode.no, page), b64);
    if (spread) await saveSpot(episode.no, page, Buffer.from(b64, "base64"), textSide);
    if (wide) {
      const spot = await findSpreadTextSpot(Buffer.from(b64, "base64"), side);
      const { error } = await db.storage
        .from(SAMPLE_BUCKET)
        .upload(seriesImageTextPath(series.id, episode.no, page), JSON.stringify({ spot }), { contentType: "application/json", upsert: true, cacheControl: "300" });
      if (error) throw new Error(error.message);
    } else if (page > 0) {
      // 正方形で描き直したら、前の横長の絵の置き場所は使わない
      await db.storage.from(SAMPLE_BUCKET).remove([seriesImageTextPath(series.id, episode.no, page)]);
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("series generation failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "作成に失敗しました" }, { status: 500 });
  }
}

type Db = NonNullable<ReturnType<typeof getSupabase>>;

const WHO_LABEL: Record<Who, string> = { child: "主人公", mom: "ママ", dad: "パパ" };

/** 非公開の books に置いた絵・写真の、期限付きのURL（無いものは入れない） */
async function signedUrls(db: Db, paths: string[]) {
  const { data } = await db.storage.from(BOOK_BUCKET).createSignedUrls(paths, 60 * 60);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && !d.error && d.path).map((d) => [d.path!, d.signedUrl]));
}

/** 「自分の写真で試す」の写真を保存する（フォームで who と photo）。写真が変わったら、その写真から描いた設定画は作り直す */
async function saveOwnPhoto(request: Request) {
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定のため、写真を保存できません" }, { status: 503 });
  const form = await request.formData().catch(() => null);
  const who = PEOPLE.find((w) => w === form?.get("who"));
  const photo = form?.get("photo");
  if (!who || !(photo instanceof File) || !photo.size) return Response.json({ error: "写真を読み込めませんでした" }, { status: 400 });
  const { error } = await db.storage.from(BOOK_BUCKET).upload(ownPhotoPath(who), Buffer.from(await photo.arrayBuffer()), { contentType: photo.type || "image/jpeg", upsert: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await db.storage.from(BOOK_BUCKET).remove(SHOWN_SERIES_LIST.map((s) => ownSheetPath(s.id)));
  return Response.json({ ok: true });
}

/**
 * 見開き版の本を組み立てて保存し、見開きごとの画像とPDFのURLを返す。
 * own=false は見本の家族の絵（公開の samples）、own=true は自分の写真の絵（非公開の books、期限付きのURL）。
 * name・honorific は画面で入れた主人公の名前と呼び方（空なら見本の名前）。メッセージは仮の文
 */
async function renderBook(db: Db, id: Parameters<typeof seriesImagePath>[0], episode: number, combo: Combo, level: LevelId, opts: { own: boolean; name: string; honorific: HonorificId | null }) {
  const bucket = opts.own ? BOOK_BUCKET : SAMPLE_BUCKET;
  const download = async (path: string) => {
    const { data } = await db.storage.from(bucket).download(path);
    return data ? Buffer.from(await data.arrayBuffer()) : null;
  };
  const book = getBook(seriesKey(id, episode, level, combo), null, await readScriptEdits());
  if (!book) return { error: "台本を読み込めません" };
  const coverImage = await download(opts.own ? ownCoverPath(id, episode) : seriesImagePath(id, episode, 0));
  if (!coverImage) return { error: opts.own ? "先にこの話の表紙の絵を作ってください（「まだ無い絵をまとめて作る」で作れます）" : "先にこの話の表紙の絵を作ってください（下の「まとめて作る」の表紙）" };
  const spreadPath = opts.own ? ownBookSpreadPath : seriesBookSpreadPath;
  const spreadTextPath = opts.own ? ownBookSpreadTextPath : seriesBookSpreadTextPath;
  const characterPath = opts.own ? ownCharacterPath : seriesCharacterPath;

  const childName = opts.name || seriesSampleChildName(id);
  const scenes = [];
  const missing: number[] = [];
  for (let i = 0; i < book.scenes.length; i++) {
    const image = await download(spreadPath(id, episode, combo, i + 1));
    if (!image) {
      missing.push(i + 1);
      continue;
    }
    const json = await download(spreadTextPath(id, episode, combo, i + 1));
    const saved = json ? (JSON.parse(json.toString()) as { spot?: string }).spot : null;
    // 置き場所が無い・被らない場所が無い（none）ときは、文を置くよう頼んだページの下に置く
    const spot = (SPREAD_TEXT_SPOTS as readonly string[]).includes(saved ?? "") ? (saved as SpreadTextSpot) : (`${bookTextSide(i + 1)}-bottom` as const);
    scenes.push({ image, text: sceneText(book.scenes[i], childName), spot });
  }
  if (missing.length) return { error: `見開きの絵がまだ無い場面があります（場面${missing.join("・")}）` };

  // 登場人物しょうかい：主人公と、この組み合わせで出るママ・パパ（絵がある人）と相棒
  const honorific = opts.honorific ?? (id === "number" ? "chan" : "kun");
  const called = calledName(childName, honorific);
  const people: ("child" | "mom" | "dad")[] = ["child"];
  if (combo === "both" || combo === "mom") people.push("mom");
  if (combo === "both" || combo === "dad") people.push("dad");
  const characters = [];
  for (const who of people) {
    const image = await download(characterPath(id, episode, who));
    if (image) characters.push({ name: who === "child" ? called : who === "mom" ? "ママ" : "パパ", image });
  }
  const studio = getStudioSeries(id);
  const { data: sidekickData } = await db.storage.from(SAMPLE_BUCKET).download(seriesSidekickPath(id));
  if (studio && sidekickData) characters.push({ name: sidekickShortName(studio.sidekickLabel), image: Buffer.from(await sidekickData.arrayBuffer()) });
  const familyPhoto = opts.own ? null : await download(seriesFamilyPhotoPath(id));
  const { pdf, view } = await buildSpreadBook({
    title: bookTitle(seriesKey(id, episode, level), childName),
    volume: 1,
    coverImage,
    scenes,
    extras: {
      called,
      message: `${called}、うまれてきてくれて ありがとう。いつも えがおを ありがとう。これからも たくさん いっしょに あそぼうね。`,
      // 見本の家族写真を思い出の写真に入れる（自分の写真のときは入れず、写真のページはおえかきページになる）
      memoryPhotos: familyPhoto ? [familyPhoto] : [],
      serial: 1,
      characters,
    },
  });

  const upload = async (path: string, bytes: Buffer, contentType: string) => {
    const { error } = await db.storage.from(bucket).upload(path, bytes, { contentType, upsert: true, cacheControl: "60" });
    if (error) throw new Error(error.message);
  };
  const stamp = Date.now();
  const viewPaths = view.map((_, i) => (opts.own ? ownBookViewPath : seriesBookViewPath)(id, episode, combo, level, i));
  const pdfPath = (opts.own ? ownBookPdfPath : seriesBookPdfPath)(id, episode, combo, level);
  await Promise.all([...view.map((v, i) => upload(viewPaths[i], v.image, "image/jpeg")), upload(pdfPath, pdf, "application/pdf")]);
  const signed = opts.own ? await signedUrls(db, [...viewPaths, pdfPath]) : {};
  const urlOf = (path: string) => (opts.own ? signed[path] : `${samplePublicUrl(path)}?v=${stamp}`) ?? "";
  const pages = view.map((v, i) => ({ label: v.label, url: urlOf(viewPaths[i]) }));
  return { pages, pdf: urlOf(pdfPath), missingCharacters: people.length + 1 - characters.length };
}
