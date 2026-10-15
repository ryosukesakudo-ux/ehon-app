import { toFile } from "openai";
import { calledName, sceneText } from "@/lib/catalog";
import { getBook } from "@/lib/book";
import { illustrateSeries, makeSeriesCharacter, makeSeriesFamilyPhoto, makeSeriesFamilyPhotoFromText, makeSeriesSheet } from "@/lib/illustrate";
import { characterSheetPath, samplePublicUrl } from "@/lib/samples";
import {
  SPREAD_TEXT_SPOTS,
  seriesBookPdfPath,
  seriesBookSpreadPath,
  seriesBookSpreadTextPath,
  seriesBookViewPath,
  seriesCharacterPath,
  seriesFamilyPhotoPath,
  seriesImagePath,
  seriesSampleChildName,
  seriesSheetPath,
  seriesSpreadPath,
  seriesSpreadTextPath,
  usesShowcasePhoto,
  type SpreadTextSpot,
} from "@/lib/series";
import { buildSpreadBook } from "@/lib/spread-book";
import { findSpreadTextSpot, isSpotDark } from "@/lib/spread-text";
import { getStudioSeries, studioScenesFor } from "@/lib/series-studio";
import { SAMPLE_BUCKET, getSupabase } from "@/lib/services";
import { bookTitle, getSeriesInfo, openEpisodes, seriesKey, type Combo, type LevelId } from "@/lib/story-key";

const COMBOS: Combo[] = ["both", "mom", "dad", "none"];
const LEVEL_IDS: LevelId[] = ["s", "n", "l"];
/** 見開き版の本で、文を置くページ（絵を描くときに空けておくページ）。場面ごとに右・左を交互にして、絵の構図に変化をつける */
const bookTextSide = (page: number) => (page % 2 === 1 ? "right" : "left");

export const maxDuration = 300;

// 台本の絵スタジオから呼ぶ。作例の家族でシリーズの絵を1枚作り、公開ストレージ（samples）に保存する。
// note：その絵だけに効く追加の指示（日本語でよい）。
// kind=sheet：シリーズの設定画（作例の設定画＋相棒） / kind=photo：サンプル集に出す、設定画の家族そっくりの架空の家族写真
// （写真が先のシリーズは逆：photo を文章から先に作り、sheet と場面はその写真に寄せる） / それ以外：その話の表紙（page=0）か場面（1〜12）
// spread=true：場面を見開き（横長）で描く試作。今の場面の絵とは別の場所に保存する。textSide のページを空けて描き、
// できた絵をAIが見て文の置き場所（人物・動物のいない所）を決めて、隣にJSONで保存する
// kind=spreadText：今ある見開きの絵で、文の置き場所だけ選び直す
// 見開き版の本の試作（combo＝写真の組み合わせ both / mom / dad / none）：
// kind=bookChara：登場人物しょうかい用に、ひとり分（who）のキャラクターの絵を作る / kind=bookSpread：その組み合わせの場面（page 1〜12）を見開きで描く
// kind=bookRender：表紙から最後のページまでを見開きごとの画像とPDFにする（level＝文の量 s / n / l）。できた画像とPDFのURLを返す
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const series = getStudioSeries(String(body?.series ?? ""));
  if (!series) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
  const db = getSupabase();
  if (!db) return Response.json({ error: "Supabase が未設定のため、絵を保存できません" }, { status: 503 });

  const load = async (path: string, name: string) => {
    const { data, error } = await db.storage.from(SAMPLE_BUCKET).download(path);
    return error || !data ? null : toFile(data, name, { type: "image/png" });
  };
  const save = async (path: string, b64: string) => {
    const { error } = await db.storage
      .from(SAMPLE_BUCKET)
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

  try {
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

    if (body?.kind === "bookChara") {
      const who = (["child", "mom", "dad"] as const).find((w) => w === body?.who);
      if (!episode || !who) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
      const sheet = await load(seriesSheetPath(series.id), "characters.png");
      if (!sheet) return Response.json({ error: "先に登場人物の設定画を作ってください" }, { status: 400 });
      const photo = series.photoFirst ? await load(seriesFamilyPhotoPath(series.id), "family-photo.png") : null;
      await save(seriesCharacterPath(series.id, episode.no, who), await makeSeriesCharacter({ series, who, outfits: episode.outfits, sheet, photo, note }));
      return Response.json({ ok: true });
    }

    if (body?.kind === "bookSpread") {
      const scene = episode && combo && Number.isInteger(page) ? studioScenesFor(series.id, episode.no, combo)?.[page - 1] : null;
      if (!episode || !combo || !scene) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
      const sheet = await load(seriesSheetPath(series.id), "characters.png");
      if (!sheet) return Response.json({ error: "先に登場人物の設定画を作ってください" }, { status: 400 });
      const photo = series.photoFirst ? await load(seriesFamilyPhotoPath(series.id), "family-photo.png") : null;
      if (series.photoFirst && !photo) return Response.json({ error: noPhoto }, { status: 400 });
      const side = bookTextSide(page);
      const quality = body?.quality === "preview" ? "preview" : "final";
      const b64 = await illustrateSeries({ series, scene, page, outfits: episode.outfits, continuity: episode.continuity, note, quality, sheet, photo, spread: true, textSide: side });
      await save(seriesBookSpreadPath(series.id, episode.no, combo, page), b64);
      const spot = await findSpreadTextSpot(Buffer.from(b64, "base64"), side);
      const { error } = await db.storage
        .from(SAMPLE_BUCKET)
        .upload(seriesBookSpreadTextPath(series.id, episode.no, combo, page), JSON.stringify({ spot }), { contentType: "application/json", upsert: true, cacheControl: "300" });
      if (error) throw new Error(error.message);
      return Response.json({ ok: true });
    }

    if (body?.kind === "bookRender") {
      const level = LEVEL_IDS.find((l) => l === body?.level) ?? "n";
      if (!episode || !combo) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
      const result = await renderBook(db, series.id, episode.no, combo, level);
      if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
      return Response.json({ ok: true, ...result });
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
    const b64 = await illustrateSeries({ series, scene, page, outfits: episode.outfits, continuity: episode.continuity, note, quality, sheet, photo, spread, textSide });
    await save(spread ? seriesSpreadPath(series.id, episode.no, page) : seriesImagePath(series.id, episode.no, page), b64);
    if (spread) await saveSpot(episode.no, page, Buffer.from(b64, "base64"), textSide);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("series generation failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "作成に失敗しました" }, { status: 500 });
  }
}

type Db = NonNullable<ReturnType<typeof getSupabase>>;

/** 見開き版の本を、見本の家族（主人公の名前・仮のメッセージ）で組み立てて保存し、見開きごとの画像とPDFのURLを返す */
async function renderBook(db: Db, id: Parameters<typeof seriesImagePath>[0], episode: number, combo: Combo, level: LevelId) {
  const download = async (path: string) => {
    const { data } = await db.storage.from(SAMPLE_BUCKET).download(path);
    return data ? Buffer.from(await data.arrayBuffer()) : null;
  };
  const book = getBook(seriesKey(id, episode, level, combo));
  if (!book) return { error: "台本を読み込めません" };
  const coverImage = await download(seriesImagePath(id, episode, 0));
  if (!coverImage) return { error: "先にこの話の表紙の絵を作ってください（下の「まとめて作る」の表紙）" };

  const childName = seriesSampleChildName(id);
  const scenes = [];
  const missing: number[] = [];
  for (let i = 0; i < book.scenes.length; i++) {
    const image = await download(seriesBookSpreadPath(id, episode, combo, i + 1));
    if (!image) {
      missing.push(i + 1);
      continue;
    }
    const json = await download(seriesBookSpreadTextPath(id, episode, combo, i + 1));
    const saved = json ? (JSON.parse(json.toString()) as { spot?: string }).spot : null;
    // 置き場所が無い・被らない場所が無い（none）ときは、文を置くよう頼んだページの下に置く
    const spot = (SPREAD_TEXT_SPOTS as readonly string[]).includes(saved ?? "") ? (saved as SpreadTextSpot) : (`${bookTextSide(i + 1)}-bottom` as const);
    scenes.push({ image, text: sceneText(book.scenes[i], childName), spot });
  }
  if (missing.length) return { error: `見開きの絵がまだ無い場面があります（場面${missing.join("・")}）` };

  // 登場人物しょうかい：主人公と、この組み合わせで出るママ・パパ（絵がある人）
  const honorific = id === "number" ? "chan" : "kun";
  const called = calledName(childName, honorific);
  const people: ("child" | "mom" | "dad")[] = ["child"];
  if (combo === "both" || combo === "mom") people.push("mom");
  if (combo === "both" || combo === "dad") people.push("dad");
  const characters = [];
  for (const who of people) {
    const image = await download(seriesCharacterPath(id, episode, who));
    if (image) characters.push({ name: who === "child" ? called : who === "mom" ? "ママ" : "パパ", image });
  }
  const info = getSeriesInfo(id)!;
  const next = openEpisodes(info.episodes).find((e) => e.no === episode + 1);

  const { pdf, view } = await buildSpreadBook({
    title: bookTitle(seriesKey(id, episode, level), childName),
    volume: 1,
    coverImage,
    scenes,
    extras: {
      called,
      childName,
      childAge: id === "number" ? 3 : 5,
      birthday: null,
      madeAt: new Date(),
      message: `${called}、うまれてきてくれて ありがとう。いつも えがおを ありがとう。これからも たくさん いっしょに あそぼうね。`,
      memoryPhoto: await download(seriesFamilyPhotoPath(id)),
      serial: 1,
      characters,
      nextEpisode: next ? { lead: `${info.name} 第${next.no}話`, title: next.title } : null,
    },
  });

  const upload = async (path: string, bytes: Buffer, contentType: string) => {
    const { error } = await db.storage.from(SAMPLE_BUCKET).upload(path, bytes, { contentType, upsert: true, cacheControl: "60" });
    if (error) throw new Error(error.message);
  };
  const stamp = Date.now();
  const pages = await Promise.all(
    view.map(async (v, i) => {
      const path = seriesBookViewPath(id, episode, combo, level, i);
      await upload(path, v.image, "image/jpeg");
      return { label: v.label, url: `${samplePublicUrl(path)}?v=${stamp}` };
    }),
  );
  const pdfPath = seriesBookPdfPath(id, episode, combo, level);
  await upload(pdfPath, pdf, "application/pdf");
  return { pages, pdf: `${samplePublicUrl(pdfPath)}?v=${stamp}`, missingCharacters: people.length - characters.length };
}
