"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { samplePublicUrl } from "@/lib/samples";
import { SERIES_NOTE_MAX, isPhotoFirst, seriesFamilyPhotoPath, seriesSampleChildName, seriesImagePath, seriesSheetPath, seriesSpreadPath, seriesSpreadTextPath, usesShowcasePhoto, type SeriesId, type SpreadTextSpot } from "@/lib/series";
import { SampleImage } from "@/components/sample-image";

// 台本の絵スタジオ：架空の家族（ふつうは作例と同じ家族。数のお勉強は別の家族で、写真が先）で、台本（シリーズ）の各話の表紙と12場面を水彩で作る。
// ① 登場人物の設定画（家族＋相棒）→ ② 話ごとに「まとめて作る」。気に入らない絵は1枚ずつ作り直せる。

const PARALLEL = 3;
type Key = `${number}/${number}`;

/** 画面に出す分だけの台本（場面の説明） */
export type StudioView = {
  id: SeriesId;
  name: string;
  sidekickLabel: string;
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
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [version, setVersion] = useState<Record<string, number>>({});
  // 絵ごとの追加の指示。その絵を作る／作り直すときだけ使う（まとめて作るときも、書いてあればその絵に効く）
  const [notes, setNotes] = useState<Record<string, string>>({});
  const noteProps = (key: string) => ({ note: notes[key] ?? "", onNote: (v: string) => setNotes((n) => ({ ...n, [key]: v })) });

  async function call(key: string, body: object) {
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
      return true;
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
  const makePage = (episode: number, page: number) => call(`${episode}/${page}` satisfies Key, { episode, page, quality });
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
    if (!confirm(`第${no}話の表紙と12場面（13枚）をまとめて作ります。AI代は約${13 * per}円です。よろしいですか？`)) return;
    if (photoFirst && !(await exists(seriesFamilyPhotoPath(SERIES_ID))) && !(await makePhoto())) return;
    if (!(await exists(seriesSheetPath(SERIES_ID))) && !(await makeSheet())) return;
    const jobs = Array.from({ length: 13 }, (_, page) => () => makePage(no, page));
    const run = async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) await job();
    };
    await Promise.all(Array.from({ length: PARALLEL }, run));
  }

  const anyBusy = Object.values(busy).some(Boolean);

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

      {series.episodes.map((ep) => (
        <section key={ep.no} className="card" style={{ gap: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
            <h2 className="display" style={{ margin: 0, fontSize: 18, color: "var(--navy)" }}>
              第{ep.no}話「{ep.title}」
            </h2>
            <button type="button" className="cta" style={{ width: "auto", height: 44, padding: "0 20px", fontSize: 15 }} disabled={anyBusy} onClick={() => makeEpisode(ep.no)}>
              まとめて作る（表紙＋12場面）
            </button>
          </div>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {ep.scenes.map((sc, i) => (
              <Tile
                key={i}
                path={seriesImagePath(SERIES_ID, ep.no, i + 1)}
                version={version[`${ep.no}/${i + 1}`]}
                busy={busy[`${ep.no}/${i + 1}`]}
                error={errors[`${ep.no}/${i + 1}`]}
                label={`場面${i + 1}：${sc.label}`}
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

/** 見開きの試作の見え方：2:1 に上下を切り、真ん中に綴じ目の点線。文は人物・動物のいない所（AIが選んだ場所）に黒い字で重ねる（後ろが暗いときだけ薄い白を敷く） */
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
  // 白い背景は基本なし。文字の後ろの絵が暗いときだけ、薄い白を敷く
  const dark = found.key === key && found.dark === true;
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
                  background: dark ? "rgba(255,255,255,0.35)" : "transparent",
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
  version?: number;
  busy?: boolean;
  error?: string;
  label: string;
  aspect?: string;
  width?: number;
  disabled: boolean;
  onMake: () => void;
  /** ここでは作らない絵（森の家族写真は作例スタジオで作る） */
  readOnly?: boolean;
  note: string;
  onNote: (v: string) => void;
}) {
  const url = samplePublicUrl(props.path);
  const openedAt = usePageOpenedAt();
  const v = props.version ?? openedAt;
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
              key={v}
              src={url && `${url}?v=${v}`}
              unoptimized
              alt={props.label}
              fallback={<span style={{ color: "#888" }}>未作成</span>}
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
