"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { HONORIFICS, type HonorificId } from "@/lib/catalog";
import { toViewablePhoto } from "@/lib/heic-photo";
import { samplePublicUrl } from "@/lib/samples";
import { shrinkPhoto } from "@/lib/shrink-photo";
import {
  SERIES_NOTE_MAX,
  isPhotoFirst,
  ownBookSpreadPath,
  ownCharacterPath,
  ownCoverPath,
  ownPhotoPath,
  ownSheetPath,
  seriesBookSpreadPath,
  seriesCharacterPath,
  seriesFamilyPhotoPath,
  seriesSampleChildName,
  seriesImagePath,
  seriesSceneTextSide,
  seriesSheetPath,
  seriesSidekickPath,
  seriesSpreadPath,
  sidekickShortName,
  seriesSpreadTextPath,
  usesShowcasePhoto,
  type SeriesId,
  type SpreadTextSpot,
} from "@/lib/series";
import { SampleImage } from "@/components/sample-image";

// 台本の絵スタジオ：架空の家族（ふつうは作例と同じ家族。数のお勉強は別の家族で、写真が先）で、台本（シリーズ）の各話の表紙と12場面を水彩で作る。
// ① 登場人物の設定画（家族＋相棒）→ ② 話ごとに「まとめて作る」。気に入らない絵は1枚ずつ作り直せる。

const PARALLEL = 3;
type Key = `${number}/${number}`;
type Who = "child" | "mom" | "dad";
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

/** 画面に出す分だけの台本（場面の説明） */
export type StudioView = {
  id: SeriesId;
  name: string;
  sidekickLabel: string;
  /** お話選びに出ているシリーズか（出ていないシリーズは、話を本番に出してもまだ「準備中」） */
  open: boolean;
  /** 本番に出している（お客様が注文できる）話 */
  published: number[];
  episodes: { no: number; title: string; cover: { label: string }; scenes: { label: string; texts: string[] }[] }[];
};

export function SeriesStudio({ list }: { list: StudioView[] }) {
  const [seriesId, setSeriesId] = useState<SeriesId>(list[0].id);
  const series = list.find((s) => s.id === seriesId)!;
  const SERIES_ID = seriesId;
  const childName = seriesSampleChildName(seriesId);
  // 写真が先のシリーズ：家族写真 → 設定画（写真そっくり） → 場面（設定画＋写真）の順に作る
  const photoFirst = isPhotoFirst(seriesId);
  // 森：家族写真はトップの写真（作例スタジオの①）と共用。ここでは作らない
  const sharedPhoto = usesShowcasePhoto(seriesId);
  const [quality, setQuality] = useState<"preview" | "final">("preview");
  // 各話の見本の場面を横長（見開き）で描く（2026-10-16 作道さん。お客様の本が見開きになったため）。外すと今までの正方形
  const [wide, setWide] = useState(true);
  // 本番に出している話（ボタンで変えたらすぐ反映）
  const [published, setPublishedState] = useState<Record<string, number[]>>(() => Object.fromEntries(list.map((s) => [s.id, s.published])));
  const publishedHere = published[seriesId] ?? [];
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [version, setVersion] = useState<Record<string, number>>({});
  // 絵ごとの追加の指示。その絵を作る／作り直すときだけ使う（まとめて作るときも、書いてあればその絵に効く）
  const [notes, setNotes] = useState<Record<string, string>>({});
  const noteProps = (key: string) => ({ note: notes[key] ?? "", onNote: (v: string) => setNotes((n) => ({ ...n, [key]: v })) });

  async function call(key: string, body: object): Promise<Record<string, unknown> | false> {
    setBusy((b) => ({ ...b, [key]: true }));
    setErrors((e) => ({ ...e, [key]: "" }));
    try {
      const res = await fetch("/api/admin/series", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ series: SERIES_ID, note: notes[key] ?? "", ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "作成に失敗しました");
      setVersion((v) => ({ ...v, [key]: Date.now() }));
      return json;
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: e instanceof Error ? e.message : "作成に失敗しました" }));
      return false;
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  const makeSheet = () => call("sheet", { kind: "sheet" });
  async function makePhoto() {
    // 写真が先のシリーズで写真を作り直すと、設定画と場面の元が変わる（森は前の家族写真をそのまま使っている）
    if (photoFirst && (await exists(seriesFamilyPhotoPath(SERIES_ID))) && !confirm("今の家族写真を、新しく作った写真に置き換えます。設定画と場面もすべて作り直しが必要になります。よろしいですか？")) return false;
    return call("photo", { kind: "photo" });
  }
  const makePage = (episode: number, page: number) => call(`${episode}/${page}` satisfies Key, { episode, page, quality, wide: wide && page > 0 });
  async function togglePublish(no: number) {
    const on = !publishedHere.includes(no);
    const msg = on
      ? `第${no}話を本番に出します。お客様がお話選びでこの話を選んで注文できるようになり、トップ・サンプル集の見本にもこの絵が使われます。よろしいですか？`
      : `第${no}話を本番から取り下げます。お話選びでは「Coming soon」になり、新しく注文できなくなります（注文済みの本はそのまま作れます）。よろしいですか？`;
    if (!confirm(msg)) return;
    const json = await call(`publish/${no}`, { kind: "publish", episode: no, published: on });
    if (json && Array.isArray(json.published)) setPublishedState((p) => ({ ...p, [seriesId]: json.published as number[] }));
  }
  // 見開きの試作（今の場面の絵とは別に保存）
  const [spreadEp, setSpreadEp] = useState(series.episodes[0]?.no ?? 1);
  const [spreadPage, setSpreadPage] = useState(5);
  const [textSide, setTextSide] = useState<"left" | "right">("right");
  // 重ねて見せる文の量（0 少ない / 1 普通 / 2 多い）。置き場所は「多い」の枠で探すので、どれでも被らない
  const [spreadLevel, setSpreadLevel] = useState(1);
  const spreadKey = `spread/${spreadEp}/${spreadPage}`;
  const makeSpread = async () => {
    if (!(await exists(seriesSheetPath(SERIES_ID))) && !(await makeSheet())) return;
    await call(spreadKey, { episode: spreadEp, page: spreadPage, quality, spread: true, textSide });
  };
  // 今ある見開きの絵で、文の置き場所だけAIに選び直してもらう（絵は変わらない）
  const findSpreadText = () => call(spreadKey, { kind: "spreadText", episode: spreadEp, page: spreadPage, textSide });
  const spreadEpisode = series.episodes.find((e) => e.no === spreadEp) ?? series.episodes[0];

  async function exists(path: string) {
    const url = samplePublicUrl(path);
    return url ? fetch(url, { method: "HEAD", cache: "no-store" }).then((r) => r.ok).catch(() => false) : false;
  }

  async function makeEpisode(no: number) {
    const per = quality === "final" ? 30 : 15;
    if (!confirm(`第${no}話の表紙と12場面（13枚）を${wide ? "横長（見開き）で" : "正方形で"}まとめて作ります。AI代は約${13 * per}円です。よろしいですか？${publishedHere.includes(no) ? "\n\nこの話は本番に出ているので、作り直した絵はすぐトップ・サンプル集の見本に出ます。" : ""}`)) return;
    if (photoFirst && !(await exists(seriesFamilyPhotoPath(SERIES_ID))) && !(await makePhoto())) return;
    if (!(await exists(seriesSheetPath(SERIES_ID))) && !(await makeSheet())) return;
    const jobs = Array.from({ length: 13 }, (_, page) => () => makePage(no, page));
    const run = async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) await job();
    };
    await Promise.all(Array.from({ length: PARALLEL }, run));
  }

  const anyBusy = Object.values(busy).some(Boolean);
  // 見開き版の本（表紙から最後のページまで）。主人公は必ず出る。ママ・パパは写真がある前提で選ぶ（台本の出し分けのとおりに場面が変わる）
  const [bookEp, setBookEp] = useState(series.episodes[0]?.no ?? 1);
  const [bookMom, setBookMom] = useState(true);
  const [bookDad, setBookDad] = useState(true);
  const [bookLevel, setBookLevel] = useState<"s" | "n" | "l">("n");
  const [book, setBook] = useState<{ key: string; pages: { label: string; url: string }[]; pdf: string; missingCharacters: number } | null>(null);
  // 自分の写真で試す（2026-10-15 作道さん）：写真と絵は非公開の場所に保存し、期限付きのURLで見る
  const [bookOwn, setBookOwn] = useState(false);
  // 主人公の名前と呼び方（本の文・登場人物しょうかいに入る）。空なら見本の名前
  const [bookName, setBookName] = useState("");
  const [bookHonorific, setBookHonorific] = useState<HonorificId>(seriesId === "number" ? "chan" : "kun");
  const shownName = bookName.trim() || childName;
  const bookCombo = bookMom && bookDad ? "both" : bookMom ? "mom" : bookDad ? "dad" : "none";
  const bookWho: Who[] = ["child", ...(bookMom ? (["mom"] as const) : []), ...(bookDad ? (["dad"] as const) : [])];
  const bookEpisode = series.episodes.find((e) => e.no === bookEp) ?? series.episodes[0];
  const bookViewKey = `${SERIES_ID}/${bookEpisode?.no}/${bookCombo}/${bookLevel}/${bookOwn ? "own" : "sample"}/${shownName}/${bookHonorific}`;
  const bookSpreadKey = (page: number) => `book/${bookOwn ? "own/" : ""}${bookEpisode?.no}/${bookCombo}/${page}`;
  const charaKey = (who: string) => `bookChara/${bookOwn ? "own/" : ""}${bookEpisode?.no}/${who}`;
  const ownCoverKey = `ownCover/${bookEpisode?.no}`;
  const whoLabel = (w: Who) => (w === "child" ? shownName : w === "mom" ? "ママ" : "パパ");

  // 自分の写真と、その写真から描いた絵の期限付きURL（パス → URL）
  const [ownUrls, setOwnUrls] = useState<Record<string, string>>({});
  const refreshOwn = useCallback(async () => {
    if (!bookEpisode) return {};
    const res = await fetch("/api/admin/series", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ series: SERIES_ID, kind: "ownList", episode: bookEpisode.no, combo: bookCombo }),
    }).catch(() => null);
    const json = res?.ok ? await res.json() : null;
    const urls = (json?.urls ?? {}) as Record<string, string>;
    setOwnUrls(urls);
    return urls;
  }, [SERIES_ID, bookEpisode, bookCombo]);
  useEffect(() => {
    if (bookOwn) void refreshOwn();
  }, [bookOwn, refreshOwn]);

  // 写真を選ぶ：「未作成」や「写真を選ぶ」を押すと、その人の写真を選ぶ画面を開く
  const fileInput = useRef<HTMLInputElement>(null);
  const pickingFor = useRef<Who>("child");
  const pickPhoto = (who: Who) => {
    pickingFor.current = who;
    fileInput.current?.click();
  };
  async function onPhotoChosen(file: File | undefined) {
    if (!file) return;
    const who = pickingFor.current;
    const key = `ownPhoto/${who}`;
    setBusy((b) => ({ ...b, [key]: true }));
    setErrors((e) => ({ ...e, [key]: "" }));
    try {
      const form = new FormData();
      form.set("who", who);
      form.set("photo", await shrinkPhoto(await toViewablePhoto(file), 1600));
      const res = await fetch("/api/admin/series", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "写真を保存できませんでした");
      await refreshOwn();
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: e instanceof Error ? e.message : "写真を保存できませんでした" }));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  const ownCall = async (key: string, body: object) => {
    const ok = await call(key, { ...body, own: true });
    if (ok) await refreshOwn();
    return ok;
  };
  const makeBookSpread = (page: number) =>
    bookOwn
      ? ownCall(bookSpreadKey(page), { kind: "bookSpread", episode: bookEpisode.no, page, combo: bookCombo, quality })
      : call(bookSpreadKey(page), { kind: "bookSpread", episode: bookEpisode.no, page, combo: bookCombo, quality });
  const makeBookChara = (who: string) =>
    bookOwn ? ownCall(charaKey(who), { kind: "bookChara", episode: bookEpisode.no, who }) : call(charaKey(who), { kind: "bookChara", episode: bookEpisode.no, who });
  const makeOwnCover = () => ownCall(ownCoverKey, { kind: "ownCover", episode: bookEpisode.no, quality });
  const makeOwnSheet = () => ownCall("ownSheet", { kind: "ownSheet" });

  async function makeOwnAll() {
    const urls = await refreshOwn();
    const lacking = bookWho.filter((w) => !urls[ownPhotoPath(w)]);
    if (lacking.length) return alert(`先に写真を選んでください（${lacking.map(whoLabel).join("・")}）。いない人は上のチェックを外してください。`);
    const spreads = Array.from({ length: 12 }, (_, i) => i + 1).filter((p) => !urls[ownBookSpreadPath(SERIES_ID, bookEpisode.no, bookCombo, p)]);
    const charas: (Who | "sidekick")[] = bookWho.filter((w) => !urls[ownCharacterPath(SERIES_ID, bookEpisode.no, w)]);
    const cover = !urls[ownCoverPath(SERIES_ID, bookEpisode.no)];
    const sheet = !urls[ownSheetPath(SERIES_ID)];
    // 相棒の絵は見本と共用（見本の設定画から描く）
    const sidekick = !(await exists(seriesSidekickPath(SERIES_ID)));
    if (sidekick) charas.push("sidekick");
    if (!spreads.length && !charas.length && !cover) return alert("この組み合わせの絵はすべてそろっています。気になる絵は1枚ずつ作り直してください。");
    const per = quality === "final" ? 30 : 15;
    const yen = spreads.length * (quality === "final" ? 45 : 23) + charas.length * 15 + (cover ? per : 0) + (sheet ? 50 : 0);
    if (!confirm(`まだ無い絵を作ります（${sheet ? "設定画1枚・" : ""}${cover ? "表紙1枚・" : ""}見開き${spreads.length}枚・登場人物${charas.length}人）。AI代は約${yen}円です。よろしいですか？`)) return;
    // 設定画は全部の絵のもとになるので、先に1枚だけ作る
    if (sheet && !(await makeOwnSheet())) return;
    if (sidekick && !(await exists(seriesSheetPath(SERIES_ID))) && !(await makeSheet())) return;
    const jobs = [...(cover ? [makeOwnCover] : []), ...charas.map((w) => () => makeBookChara(w)), ...spreads.map((p) => () => makeBookSpread(p))];
    const run = async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) await job();
    };
    await Promise.all(Array.from({ length: PARALLEL }, run));
  }

  async function makeBookAll() {
    if (!bookEpisode) return;
    if (bookOwn) return makeOwnAll();
    const spreads = (await Promise.all(Array.from({ length: 12 }, async (_, i) => ((await exists(seriesBookSpreadPath(SERIES_ID, bookEpisode.no, bookCombo, i + 1))) ? null : i + 1)))).filter((p): p is number => p !== null);
    const charas: (Who | "sidekick")[] = (await Promise.all(bookWho.map(async (w) => ((await exists(seriesCharacterPath(SERIES_ID, bookEpisode.no, w))) ? null : w)))).filter((w): w is Who => w !== null);
    if (!(await exists(seriesSidekickPath(SERIES_ID)))) charas.push("sidekick");
    if (!spreads.length && !charas.length) return alert("この組み合わせの絵はすべてそろっています。気になる絵は1枚ずつ作り直してください。");
    const yen = spreads.length * (quality === "final" ? 45 : 23) + charas.length * 15;
    if (!confirm(`まだ無い絵を作ります（見開き${spreads.length}枚・登場人物${charas.length}人）。AI代は約${yen}円です。よろしいですか？`)) return;
    if (photoFirst && !(await exists(seriesFamilyPhotoPath(SERIES_ID)))) return alert("先に家族写真を作ってください");
    if (!(await exists(seriesSheetPath(SERIES_ID))) && !(await makeSheet())) return;
    const jobs = [...charas.map((w) => () => makeBookChara(w)), ...spreads.map((p) => () => makeBookSpread(p))];
    const run = async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) await job();
    };
    await Promise.all(Array.from({ length: PARALLEL }, run));
  }
  async function renderBook() {
    const json = await call("bookRender", { kind: "bookRender", episode: bookEpisode.no, combo: bookCombo, level: bookLevel, own: bookOwn, name: bookName.trim(), honorific: bookHonorific });
    if (json) setBook({ key: bookViewKey, pages: json.pages as { label: string; url: string }[], pdf: json.pdf as string, missingCharacters: Number(json.missingCharacters ?? 0) });
  }


  const sheetSection = (
    <section className="card" style={{ gap: 12 }}>
      <h2 className="display" style={{ margin: 0, fontSize: 18, color: "var(--navy)" }}>登場人物の設定画</h2>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
        {photoFirst ? "上の家族写真の3人を写真そっくりに絵にして" : "作例スタジオの家族3人（無いシリーズは文章から描きます）に"}、{series.sidekickLabel}を加えた1枚です。すべての場面がこの絵をもとに描かれます。作り直したら、場面も作り直してください（1枚 約50円）。
      </p>
      <Tile
        path={seriesSheetPath(SERIES_ID)}
        version={version.sheet}
        busy={busy.sheet}
        error={errors.sheet}
        label="家族＋相棒の設定画"
        aspect="3 / 2"
        width={420}
        onMake={makeSheet}
        disabled={anyBusy}
        {...noteProps("sheet")}
      />
    </section>
  );
  const photoSection = (
    <section className="card" style={{ gap: 12 }}>
      <h2 className="display" style={{ margin: 0, fontSize: 18, color: "var(--navy)" }}>サンプル集の家族写真</h2>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
        サンプル集（/samples）の「この写真から → この登場人物に」に出す架空の家族写真です。左からママ・{childName}・パパの順に並べ、画面ではその順に名前を付けます。
        {sharedPhoto
          ? "このシリーズは、トップの「この写真から → この絵本に」と同じ写真（作例スタジオの①）を使い、この写真をもとに設定画と場面を描きます。写真を作り直すときは作例スタジオで作り、そのあと設定画と場面も作り直してください。"
          : photoFirst
          ? "このシリーズは、この写真をもとに設定画と場面を描きます。並びや雰囲気が違ったら、欄に指示を書いて作り直してください（1枚 約40円）。作り直したら、設定画と場面も作り直してください。"
          : "設定画の家族3人にそっくりに作ります。並びが違ったり似ていなかったりしたら、欄に指示を書いて作り直してください（1枚 約40円）。設定画を作り直したら、これも作り直してください。"}
      </p>
      <Tile
        path={seriesFamilyPhotoPath(SERIES_ID)}
        version={version.photo}
        busy={busy.photo}
        error={errors.photo}
        label="架空の家族写真（左からママ・主人公・パパ）"
        aspect="3 / 2"
        width={420}
        onMake={makePhoto}
        disabled={anyBusy}
        readOnly={sharedPhoto}
        {...noteProps("photo")}
      />
    </section>
  );

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <a href="/admin">← 注文管理へ</a>
      <a href="/admin/series/saved">見本の保存版（今の13枚をとっておく・見返す）→</a>
      <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>台本の絵スタジオ</h1>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8 }}>
        {childName === seriesSampleChildName("forest") ? "作例と同じ" : "このシリーズ用の"}架空の家族（主人公「{childName}」とママ・パパ）で、「{series.name}」の台本の見本の絵を水彩で作ります。表紙と12場面の13枚がそろった話から、お客様がお話選びの画面で選べるようになります（表紙はその見本として表示されます）。
        {photoFirst
          ? "このシリーズは、先に架空の家族写真を作り、設定画と場面はその写真にそっくりに寄せて描きます（お客様の写真から絵本ができる流れと同じです）。まず「まとめて作る」を押してください（家族写真と設定画がまだなければ、その順に先に作ります）。"
          : "まず「まとめて作る」を押してください（登場人物の設定画がまだなければ先に作ります）。"}気に入らない絵は、その絵の下の欄に直してほしいこと（日本語で大丈夫です）を書いて、ボタンで1枚ずつ作り直せます。指示はその絵にだけ効きます。
      </p>
      <label>
        シリーズ：
        <select value={seriesId} disabled={anyBusy} onChange={(e) => { setSeriesId(e.target.value as SeriesId); setErrors({}); setNotes({}); }}>
          {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label>
        画質：
        <select value={quality} onChange={(e) => setQuality(e.target.value as "preview" | "final")}>
          <option value="preview">中画質（1枚 約15円）</option>
          <option value="final">高画質（1枚 約30円）</option>
        </select>
      </label>

      {photoFirst ? photoSection : sheetSection}
      {photoFirst ? sheetSection : photoSection}

      {spreadEpisode && (
        <section className="card" style={{ gap: 12 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 18, color: "var(--navy)" }}>見開きの試作</h2>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
            左右2ページにまたがる大きな絵（横長）で場面を描いて、文を絵に重ねたときの見え方を試します。今の場面の絵とは別に保存するので、お客様の本やサンプル集は変わりません。
            横長の絵は1枚 約{quality === "final" ? 45 : 23}円です（正方形の約1.5倍）。点線が本の綴じ目（真ん中）、絵は上下を少し切って見開きの形（2:1）にしています。
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label>
              話：
              <select value={spreadEpisode.no} disabled={anyBusy} onChange={(e) => setSpreadEp(Number(e.target.value))}>
                {series.episodes.map((ep) => <option key={ep.no} value={ep.no}>第{ep.no}話</option>)}
              </select>
            </label>
            <label>
              場面：
              <select value={spreadPage} disabled={anyBusy} onChange={(e) => setSpreadPage(Number(e.target.value))}>
                {spreadEpisode.scenes.map((sc, i) => <option key={i} value={i + 1}>場面{i + 1}：{sc.label.slice(0, 24)}</option>)}
              </select>
            </label>
            <label>
              文を置くページ：
              <select value={textSide} onChange={(e) => setTextSide(e.target.value as "left" | "right")}>
                <option value="right">右ページ（人物は左に）</option>
                <option value="left">左ページ（人物は右に）</option>
              </select>
            </label>
            <label>
              文の量：
              <select value={spreadLevel} onChange={(e) => setSpreadLevel(Number(e.target.value))}>
                <option value={0}>少ない</option>
                <option value={1}>普通</option>
                <option value={2}>多い</option>
              </select>
            </label>
          </div>
          <SpreadPreview
            path={seriesSpreadPath(SERIES_ID, spreadEpisode.no, spreadPage)}
            version={version[spreadKey]}
            busy={busy[spreadKey]}
            textPath={seriesSpreadTextPath(SERIES_ID, spreadEpisode.no, spreadPage)}
            text={spreadEpisode.scenes[spreadPage - 1]?.texts[spreadLevel] ?? ""}
            side={textSide}
          />
          <textarea
            value={notes[spreadKey] ?? ""}
            onChange={(e) => setNotes((n) => ({ ...n, [spreadKey]: e.target.value }))}
            maxLength={SERIES_NOTE_MAX}
            rows={2}
            placeholder="作り直すときの指示（例：2人を左ページに寄せて、右下は草むらに）"
            aria-label="見開きの指示"
            style={{ fontSize: 13, lineHeight: 1.5, padding: 8, borderRadius: 8, border: "1px solid #ccc", resize: "vertical", maxWidth: 720 }}
          />
          <button type="button" className="cta" style={{ width: "auto", alignSelf: "flex-start", height: 44, padding: "0 20px", fontSize: 15 }} disabled={anyBusy} onClick={makeSpread}>
            見開きで作る／作り直す
          </button>
          <button type="button" className="ghost" style={{ width: "auto", alignSelf: "flex-start", height: 40, padding: "0 16px", fontSize: 14 }} disabled={anyBusy} onClick={findSpreadText}>
            文の置き場所だけ探し直す（絵はそのまま・約1円）
          </button>
          {errors[spreadKey] && <span className="error">{errors[spreadKey]}</span>}
        </section>
      )}

      {bookEpisode && (
        <section className="card" style={{ gap: 12 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 18, color: "var(--navy)" }}>見開き版の本（表紙から最後のページまで）</h2>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
            お話の12場面を左右2ページにまたがる絵で描き、表紙・登場人物しょうかいから思い出の写真・最後のメッセージまで、しまうま A5スクエア36ページと同じ並びで本の形にして確かめます。
            ママ・パパは「写真がある人」を選ぶと、台本の出し分けのとおりに場面が変わります（いない人の場面は別の場面に置きかわります）。絵は組み合わせごとに保存され、お客様の本やサンプル集は変わりません。
            見開きの絵は1枚 約{quality === "final" ? 45 : 23}円、登場人物の絵は1人 約15円です。
            {bookOwn
              ? "「自分の写真」では、選んだ写真の顔で設定画（約50円）・表紙・登場人物・見開きを描きます。写真と絵は非公開の場所に保存し、サイトには出ません。写真を変えたら、絵も作り直してください。"
              : "表紙は下の「第◯話」の表紙の絵を使います。"}
          </p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <label><input type="radio" name="bookFamily" checked={!bookOwn} disabled={anyBusy} onChange={() => setBookOwn(false)} /> 見本の家族</label>
            <label><input type="radio" name="bookFamily" checked={bookOwn} disabled={anyBusy} onChange={() => setBookOwn(true)} /> 自分の写真</label>
            <label>
              主人公の名前：
              <input
                type="text"
                value={bookName}
                maxLength={12}
                placeholder={childName}
                onChange={(e) => setBookName(e.target.value)}
                style={{ width: 120, fontSize: 16, padding: "4px 8px", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>
            <label>
              呼び方：
              <select value={bookHonorific} onChange={(e) => setBookHonorific(e.target.value as HonorificId)}>
                {HONORIFICS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <label>
              話：
              <select value={bookEpisode.no} disabled={anyBusy} onChange={(e) => setBookEp(Number(e.target.value))}>
                {series.episodes.map((ep) => <option key={ep.no} value={ep.no}>第{ep.no}話</option>)}
              </select>
            </label>
            <label><input type="checkbox" checked disabled /> 主人公（{shownName}）</label>
            <label><input type="checkbox" checked={bookMom} disabled={anyBusy} onChange={(e) => setBookMom(e.target.checked)} /> ママ</label>
            <label><input type="checkbox" checked={bookDad} disabled={anyBusy} onChange={(e) => setBookDad(e.target.checked)} /> パパ</label>
            <label>
              文の量：
              <select value={bookLevel} onChange={(e) => setBookLevel(e.target.value as "s" | "n" | "l")}>
                <option value="s">少ない</option>
                <option value="n">普通</option>
                <option value="l">多い</option>
              </select>
            </label>
          </div>
          <button type="button" className="cta" style={{ width: "auto", alignSelf: "flex-start", height: 44, padding: "0 20px", fontSize: 15 }} disabled={anyBusy} onClick={makeBookAll}>
            まだ無い絵をまとめて作る（見開き12枚＋登場人物）
          </button>
          {bookOwn && (
            <>
              <input ref={fileInput} type="file" accept={PHOTO_ACCEPT} hidden onChange={(e) => { void onPhotoChosen(e.target.files?.[0]); e.target.value = ""; }} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                {bookWho.map((w) => {
                  const url = ownUrls[ownPhotoPath(w)];
                  return (
                    <div key={w} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => pickPhoto(w)}
                        disabled={anyBusy}
                        aria-label={`${whoLabel(w)}の写真を選ぶ`}
                        style={{ aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", background: "#eee", border: "2px dashed #bbb", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                      >
                        {busy[`ownPhoto/${w}`] ? (
                          <div className="spinner" />
                        ) : url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- 期限付きURLの写真なので、画像の最適化を通さない
                          <img src={url} alt={`${whoLabel(w)}の写真`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ color: "var(--navy)", fontWeight: 700 }}>写真を選ぶ</span>
                        )}
                      </button>
                      <span style={{ fontSize: 12, color: "var(--sub)" }}>写真：{whoLabel(w)}{url ? "（押すと変えられます）" : ""}</span>
                      {errors[`ownPhoto/${w}`] && <span className="error">{errors[`ownPhoto/${w}`]}</span>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                <Tile
                  path={ownSheetPath(SERIES_ID)}
                  src={ownUrls[ownSheetPath(SERIES_ID)] ?? null}
                  busy={busy.ownSheet}
                  error={errors.ownSheet}
                  label="写真から描いた設定画（家族＋相棒）"
                  aspect="3 / 2"
                  onMake={makeOwnSheet}
                  disabled={anyBusy}
                  {...noteProps("ownSheet")}
                />
                <Tile
                  path={ownCoverPath(SERIES_ID, bookEpisode.no)}
                  src={ownUrls[ownCoverPath(SERIES_ID, bookEpisode.no)] ?? null}
                  busy={busy[ownCoverKey]}
                  error={errors[ownCoverKey]}
                  label={`表紙：${bookEpisode.cover.label}`}
                  aspect="3 / 2"
                  onMake={makeOwnCover}
                  disabled={anyBusy}
                  {...noteProps(ownCoverKey)}
                />
              </div>
            </>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
            {bookWho.map((w) => (
              <Tile
                key={`${bookEpisode.no}-${w}-${bookOwn}`}
                path={bookOwn ? ownCharacterPath(SERIES_ID, bookEpisode.no, w) : seriesCharacterPath(SERIES_ID, bookEpisode.no, w)}
                src={bookOwn ? (ownUrls[ownCharacterPath(SERIES_ID, bookEpisode.no, w)] ?? null) : undefined}
                version={version[charaKey(w)]}
                busy={busy[charaKey(w)]}
                error={errors[charaKey(w)]}
                label={`登場人物：${whoLabel(w)}`}
                onMake={() => makeBookChara(w)}
                // 自分の写真で、まだ写真が無い人は「未作成」を押すと写真を選ぶ
                onEmpty={bookOwn && !ownUrls[ownPhotoPath(w)] ? () => pickPhoto(w) : undefined}
                emptyLabel={bookOwn && !ownUrls[ownPhotoPath(w)] ? "写真を選ぶ" : undefined}
                disabled={anyBusy}
                {...noteProps(charaKey(w))}
              />
            ))}
            {/* 相棒（シリーズに1枚。見本・自分の写真のどちらの本でも同じ絵） */}
            <Tile
              key={`sidekick-${SERIES_ID}`}
              path={seriesSidekickPath(SERIES_ID)}
              version={version[charaKey("sidekick")]}
              busy={busy[charaKey("sidekick")]}
              error={errors[charaKey("sidekick")]}
              label={`登場人物：${sidekickShortName(series.sidekickLabel)}`}
              onMake={() => call(charaKey("sidekick"), { kind: "bookChara", who: "sidekick" })}
              disabled={anyBusy}
              {...noteProps(charaKey("sidekick"))}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {bookEpisode.scenes.map((sc, i) => (
              <Tile
                key={`${bookEpisode.no}-${bookCombo}-${i}-${bookOwn}`}
                path={(bookOwn ? ownBookSpreadPath : seriesBookSpreadPath)(SERIES_ID, bookEpisode.no, bookCombo, i + 1)}
                src={bookOwn ? (ownUrls[ownBookSpreadPath(SERIES_ID, bookEpisode.no, bookCombo, i + 1)] ?? null) : undefined}
                version={version[bookSpreadKey(i + 1)]}
                busy={busy[bookSpreadKey(i + 1)]}
                error={errors[bookSpreadKey(i + 1)]}
                label={`場面${i + 1}（文は${(i + 1) % 2 === 1 ? "右" : "左"}ページ寄り）：${sc.label}`}
                aspect="3 / 2"
                onMake={() => makeBookSpread(i + 1)}
                disabled={anyBusy}
                {...noteProps(bookSpreadKey(i + 1))}
              />
            ))}
          </div>
          <button type="button" className="cta" style={{ width: "auto", alignSelf: "flex-start", height: 44, padding: "0 20px", fontSize: 15 }} disabled={anyBusy} onClick={renderBook}>
            本の形にして全ページを見る（文字入り・PDFも作る）
          </button>
          {busy.bookRender && <div className="spinner" />}
          {errors.bookRender && <span className="error">{errors.bookRender}</span>}
          {book && book.key === bookViewKey && !busy.bookRender && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <a href={book.pdf} target="_blank" rel="noreferrer" style={{ fontSize: 15, fontWeight: 700 }}>PDFを開く・保存する（全ページ）</a>
              {book.missingCharacters > 0 && <span className="error">登場人物の絵がまだ無い人がいます（{book.missingCharacters}人）。登場人物しょうかいのページに出ません。</span>}
              {book.pages.map((p) => (
                <figure key={p.url} style={{ margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- 作るたびに変わる確認用の画像なので、画像の最適化を通さない */}
                  <img src={p.url} alt={p.label} style={{ width: "100%", maxWidth: p.label === "表紙" ? 450 : 900, border: "1px solid #ddd", borderRadius: 6 }} />
                  <figcaption style={{ fontSize: 12, color: "var(--sub)" }}>{p.label}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="card" style={{ gap: 8 }}>
        <h2 className="display" style={{ margin: 0, fontSize: 18, color: "var(--navy)" }}>各話の見本（第1〜{series.episodes.length}話）</h2>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
          話ごとに表紙と12場面を作り、おかしな絵は下の欄に直してほしいことを書いて1枚ずつ作り直します。仕上がりが良ければ「本番に出す」を押すと、お客様がお話選びでその話を選んで注文できるようになります。
          {!series.open && "（このシリーズはまだお話選びに出ていないので、本番に出しても「準備中」のままです）"}
        </p>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
          <input type="checkbox" checked={wide} onChange={(e) => setWide(e.target.checked)} />
          場面を横長（見開き）で作る（お客様の本と同じ形。外すと今までの正方形）
        </label>
      </section>

      {series.episodes.map((ep) => (
        <section key={ep.no} className="card" style={{ gap: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
            <h2 className="display" style={{ margin: 0, fontSize: 18, color: "var(--navy)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              第{ep.no}話「{ep.title}」
              {publishedHere.includes(ep.no) ? (
                <span className="tag" style={{ background: "#CDEEDD" }}>本番に出ています</span>
              ) : (
                <span className="tag" style={{ background: "#eee", color: "var(--sub)" }}>まだ本番に出ていません</span>
              )}
            </h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="cta" style={{ width: "auto", height: 44, padding: "0 20px", fontSize: 15 }} disabled={anyBusy} onClick={() => makeEpisode(ep.no)}>
                まとめて作る（表紙＋12場面）
              </button>
              <button type="button" className="ghost" style={{ width: "auto", height: 44, padding: "0 16px", fontSize: 14 }} disabled={anyBusy} onClick={() => togglePublish(ep.no)}>
                {busy[`publish/${ep.no}`] ? "変えています…" : publishedHere.includes(ep.no) ? "本番から取り下げる" : "本番に出す"}
              </button>
            </div>
          </div>
          {errors[`publish/${ep.no}`] && <span className="error">{errors[`publish/${ep.no}`]}</span>}
          <Tile
            path={seriesImagePath(SERIES_ID, ep.no, 0)}
            version={version[`${ep.no}/0`]}
            busy={busy[`${ep.no}/0`]}
            error={errors[`${ep.no}/0`]}
            label={`表紙：${ep.cover.label}`}
            aspect="3 / 2"
            width={420}
            onMake={() => makePage(ep.no, 0)}
            disabled={anyBusy}
            {...noteProps(`${ep.no}/0`)}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {ep.scenes.map((sc, i) => (
              <Tile
                key={i}
                path={seriesImagePath(SERIES_ID, ep.no, i + 1)}
                version={version[`${ep.no}/${i + 1}`]}
                busy={busy[`${ep.no}/${i + 1}`]}
                error={errors[`${ep.no}/${i + 1}`]}
                // 横長の絵も、前に作った正方形の絵も全体が見えるように
                aspect="3 / 2"
                fit="contain"
                label={`場面${i + 1}${wide ? `（文は${seriesSceneTextSide(i + 1) === "right" ? "右" : "左"}ページ）` : ""}：${sc.label}`}
                onMake={() => makePage(ep.no, i + 1)}
                disabled={anyBusy}
                {...noteProps(`${ep.no}/${i + 1}`)}
              />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

// 画面を開いた時刻。絵のURLに付けて、開くたびに保存されている今の絵を読み直す。
// 以前は開いた直後の版が常に 0 で、作り直す前に縮めてキャッシュされた古い絵が出ていた（2026-10-13 作道さんの指摘）
const PAGE_OPENED_AT = typeof window === "undefined" ? 0 : Date.now();
const noSubscribe = () => () => {};
const usePageOpenedAt = () => useSyncExternalStore(noSubscribe, () => PAGE_OPENED_AT, () => 0);

/** 見開きの試作の見え方：2:1 に上下を切り、真ん中に綴じ目の点線。文は人物・動物のいない所（AIが選んだ場所）に、透明度高めの白の四角に黒い字で重ねる（2026-10-13 作道さん：白なしは見づらかった） */
function SpreadPreview(props: { path: string; textPath: string; version?: number; busy?: boolean; text: string; side: "left" | "right" }) {
  const url = samplePublicUrl(props.path);
  const textUrl = samplePublicUrl(props.textPath);
  const openedAt = usePageOpenedAt();
  const v = props.version ?? openedAt;
  const [found, setFound] = useState<{ key: string; spot: SpreadTextSpot | "none" | null; dark?: boolean }>({ key: "", spot: null });
  const key = `${textUrl}?v=${v}`;
  useEffect(() => {
    if (!textUrl || !v) return;
    let alive = true;
    fetch(key, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setFound({ key, spot: typeof j?.spot === "string" ? (j.spot as SpreadTextSpot | "none") : null, dark: j?.dark === true }))
      .catch(() => alive && setFound({ key, spot: null }));
    return () => {
      alive = false;
    };
  }, [key, textUrl, v]);
  // 置き場所がまだ無い絵（前に作った絵）は、選んだページの下に置く
  const got = found.key === key ? found.spot : null;
  // 人物・動物に被らない場所が無い絵は、文を絵に重ねず下に出して作り直しを促す
  const noRoom = got === "none";
  const spot = (got && got !== "none" ? got : null) ?? `${props.side}-bottom`;
  const [h, vert] = spot.split("-") as ["left" | "right", "top" | "middle" | "bottom"];
  const place = vert === "top" ? { top: "7%" } : vert === "bottom" ? { bottom: "7%" } : { top: "50%", transform: "translateY(-50%)" };
  return (
    <>
      <div style={{ position: "relative", width: "100%", maxWidth: 900, aspectRatio: "2 / 1", borderRadius: 8, overflow: "hidden", background: "#eee", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {props.busy || !v ? (
          <div className="spinner" />
        ) : (
          <>
            <SampleImage key={`${props.path}-${v}`} src={url && `${url}?v=${v}`} unoptimized alt="見開きの試作" style={{ objectFit: "cover" }} fallback={<span style={{ color: "#888" }}>未作成</span>} />
            <div aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: "50%", borderLeft: "2px dashed rgba(255,255,255,0.8)" }} />
            {props.text && !noRoom && (
              <p
                style={{
                  position: "absolute",
                  ...place,
                  [h]: "3%",
                  width: "44%",
                  margin: 0,
                  padding: "10px 14px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.4)",
                  fontSize: "clamp(10px, 1.6vw, 15px)",
                  lineHeight: 1.7,
                  color: "#000",
                  whiteSpace: "pre-wrap",
                }}
              >
                {props.text}
              </p>
            )}
          </>
        )}
      </div>
      {noRoom && !props.busy && (
        <p className="error" style={{ maxWidth: 900 }}>
          人物や動物に被らずに文を置ける場所がありません。指示欄に「右ページの下は空だけに」などと書いて作り直してください。（文：{props.text}）
        </p>
      )}
    </>
  );
}

function Tile(props: {
  path: string;
  /** 絵のURLを直接渡すとき（自分の写真の絵は期限付きURL）。null は「まだ無い」 */
  src?: string | null;
  /** 絵が無いときに「未作成」を押したときの動き（無ければ何もしない） */
  onEmpty?: () => void;
  emptyLabel?: ReactNode;
  version?: number;
  busy?: boolean;
  error?: string;
  label: string;
  aspect?: string;
  /** contain：枠の形と違う絵も切らずに全体を見せる */
  fit?: "contain";
  width?: number;
  disabled: boolean;
  onMake: () => void;
  /** ここでは作らない絵（森の家族写真は作例スタジオで作る） */
  readOnly?: boolean;
  note: string;
  onNote: (v: string) => void;
}) {
  const direct = props.src !== undefined;
  const url = direct ? props.src : samplePublicUrl(props.path);
  const openedAt = usePageOpenedAt();
  const v = props.version ?? openedAt;
  // 絵が無いときの表示。以前は絵へのリンクの中にあり、押すと開けないURLに飛ぶだけだった（2026-10-15 作道さん）
  const empty = (
    <span
      role={props.onEmpty ? "button" : undefined}
      onClick={(e) => {
        e.preventDefault();
        props.onEmpty?.();
      }}
      style={{ color: props.onEmpty ? "var(--navy)" : "#888", fontWeight: props.onEmpty ? 700 : undefined, cursor: props.onEmpty ? "pointer" : "default", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      {props.emptyLabel ?? "未作成"}
    </span>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: props.width }}>
      <div
        style={{
          aspectRatio: props.aspect ?? "1 / 1",
          borderRadius: 10,
          overflow: "hidden",
          background: "#eee",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {props.busy || !v ? (
          <div className="spinner" />
        ) : (
          <a href={url ?? undefined} target="_blank" rel="noreferrer" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SampleImage
              key={direct ? url : v}
              src={url ? (direct ? url : `${url}?v=${v}`) : null}
              unoptimized
              alt={props.label}
              fallback={empty}
              style={props.fit ? { objectFit: props.fit } : undefined}
            />
          </a>
        )}
      </div>
      <span style={{ fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>{props.label}</span>
      {props.readOnly ? (
        <a href="/admin/samples" style={{ fontSize: 13 }}>作例スタジオで作る</a>
      ) : (
        <>
          <textarea
            value={props.note}
            onChange={(e) => props.onNote(e.target.value)}
            maxLength={SERIES_NOTE_MAX}
            rows={2}
            placeholder="作り直すときの指示（例：もっと淡い色に）"
            aria-label={`${props.label}の指示`}
            style={{ fontSize: 13, lineHeight: 1.5, padding: 8, borderRadius: 8, border: "1px solid #ccc", resize: "vertical" }}
          />
          <button type="button" className="ghost" style={{ height: 36 }} disabled={props.disabled} onClick={props.onMake}>
            作る／作り直す
          </button>
        </>
      )}
      {props.error && <span className="error">{props.error}</span>}
    </div>
  );
}
