import type { ReactNode } from "react";
import { SampleImage } from "@/components/sample-image";
import { samplePublicUrl } from "@/lib/samples";
import { SERIES_PAGES, seriesImagePath, seriesSampleChildName } from "@/lib/series";
import { SERIES_DATA } from "@/lib/series-data";
import { savedNoteDone } from "@/lib/saved-notes-done";
import { SAVED_NOTE_MAX, listSavedSets, readSavedNotes, savedImagePath, stampLabel, type SavedNotes } from "@/lib/series-saved";
import { getStudioSeries } from "@/lib/series-studio";
import { SHOWN_SERIES_LIST } from "@/lib/story-key";
import { SavedNote } from "./note";
import { CopyNotes } from "./copy-notes";
import { DeleteSavedButton } from "./delete-button";
import { RedrawAll } from "./redraw-all";
import { SaveButton } from "./save-button";

// 見本の保存版：各話の今の13枚（表紙＋12場面）を、作り直しても消えない別の場所にとっておき、ここで見返す
export const dynamic = "force-dynamic";

/** 開いた時刻。今の見本のURLに付けて、作り直す前の古い絵が出ないようにする */
const openedAt = () => Date.now();

const pageLabel = (p: number) => (p === 0 ? "表紙" : `場面${p}`);

type NoteOf = (p: number) => ReactNode;

/** 台本：絵の説明と本文（文の量「普通」、ママもパパもいる形。ふりがなは外す）。0 が表紙 */
type Script = { label: string; text: string }[];

function scriptOf(id: keyof typeof SERIES_DATA, no: number, cover: string, title: string): Script {
  const name = seriesSampleChildName(id);
  const scenes = SERIES_DATA[id].episodes.find((e) => e.no === no)?.scenes ?? [];
  return [
    { label: cover, text: title },
    ...scenes.map((sc) => {
      const v = sc.alt?.both ?? sc;
      return { label: v.label, text: (v.text[1] ?? v.text[0] ?? "").replaceAll("{name}", name).replace(/《[^》]*》/g, "") };
    }),
  ];
}

function Thumbs({ src, unoptimized, note, script }: { src: (p: number) => string | null; unoptimized?: boolean; note?: NoteOf; script: Script }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
      {Array.from({ length: SERIES_PAGES }, (_, p) => {
        const url = src(p);
        return (
          <div key={p} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <a href={url ?? undefined} target="_blank" rel="noreferrer" style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12, color: "var(--sub)", textDecoration: "none" }}>
              <SampleImage
                src={url}
                alt={pageLabel(p)}
                sizes="240px"
                unoptimized={unoptimized}
                style={{ width: "100%", height: "auto", aspectRatio: "3 / 2", objectFit: "contain", borderRadius: 6, background: "#f3f3f3" }}
                fallback={<div style={{ aspectRatio: "3 / 2", borderRadius: 6, background: "#eee", display: "grid", placeItems: "center" }}>まだ無い</div>}
              />
              {pageLabel(p)}
            </a>
            {script[p] && (
              <div style={{ fontSize: 12, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ color: "var(--sub)" }}>絵：{script[p].label}</span>
                <span style={{ whiteSpace: "pre-wrap" }}>{script[p].text}</span>
              </div>
            )}
            {note?.(p)}
          </div>
        );
      })}
    </div>
  );
}

export default async function SavedSamplesPage() {
  const now = openedAt();
  const list = await Promise.all(
    SHOWN_SERIES_LIST.map(async (info) => {
      const s = getStudioSeries(info.id)!;
      return { s, episodes: await Promise.all(
          s.episodes.map(async (ep) => {
            const stamps = await listSavedSets(s.id, ep.no);
            const sets = await Promise.all(stamps.map(async (stamp) => ({ stamp, notes: (await readSavedNotes(s.id, ep.no, stamp)) as SavedNotes })));
            return { ep, sets, script: scriptOf(s.id, ep.no, ep.cover.label, ep.title) };
          }),
        ),
      };
    }),
  );

  // 台本にまだ入れていないメモ（Claude に渡す文）
  const pending = list.flatMap(({ s, episodes }) =>
    episodes.flatMap(({ ep, sets }) =>
      sets.flatMap(({ stamp, notes }) =>
        Object.entries(notes)
          .filter(([page]) => !savedNoteDone(s.id, ep.no, stamp, page === "all" ? "all" : Number(page)))
          .map(([page, n]) => `${s.id}/${ep.no}/${stamp}/${page}（${s.name} 第${ep.no}話 ${page === "all" ? "全体" : pageLabel(Number(page))}）：${n.text}`),
      ),
    ),
  );

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 16 }}>
      <a href="/admin/series">← 台本の絵スタジオへ</a>
      <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>見本の保存版</h1>
      {/* 今の見本は作り直すと同じ名前のまま変わるので、縮めずに元の絵を読む（保存版は変わらないので縮めてよい） */}
      <p style={{ margin: 0, fontSize: 14 }}>
        絵スタジオで作り直すと見本の絵は上書きされます。残しておきたい時に「今の13枚を保存版にする」を押すと、表紙＋12場面を日時つきで別の場所にとっておけます。絵を押すと元の大きさで開きます。絵の下に台本（絵の説明と本文。文の量は「普通」）を出しています。保存版には1枚ごとに直してほしい点をメモできます。メモは「このメモで見本を作り直す」（1枚）か「メモのある絵をまとめて作り直す」（保存済みのメモ全部）で今の見本（本番）に反映でき、「台本にまだ入れていないメモをコピー」で Claude に貼って頼むと、台本に入れてお客様の本にも効くようにします。新しいシリーズも絵スタジオに出せば、ここに並びます。
      </p>
      <CopyNotes count={pending.length} text={`保存版のメモを台本に反映して\n${pending.join("\n")}`} />
      {list.map(({ s, episodes }) => (
        <section key={s.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 20, color: "var(--navy)" }}>{s.name}</h2>
          {episodes.map(({ ep, sets, script }) => (
            <details key={ep.no} className="card" style={{ gap: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                第{ep.no}話「{ep.title}」 保存版 {sets.length}件
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
                <SaveButton series={s.id} episode={ep.no} title={ep.title} />
                {!sets.length && <span style={{ fontSize: 13, color: "var(--sub)" }}>保存版を作ると、その下でメモを書いて1枚ずつ・まとめて作り直せます。</span>}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <strong style={{ fontSize: 14 }}>今の見本</strong>
                  <Thumbs unoptimized script={script} src={(p) => { const u = samplePublicUrl(seriesImagePath(s.id, ep.no, p)); return u && `${u}?v=${now}`; }} />
                </div>
                {sets.map(({ stamp, notes }) => (
                  <div key={stamp} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 14 }}>保存版 {stampLabel(stamp)}</strong>
                      <DeleteSavedButton series={s.id} episode={ep.no} stamp={stamp} label={stampLabel(stamp)} />
                    </div>
                    <RedrawAll series={s.id} episode={ep.no} stamp={stamp} notes={Object.fromEntries(Object.entries(notes).map(([k, n]) => [k, n.text]))} />
                    <SavedNote series={s.id} episode={ep.no} stamp={stamp} page="all" initial={notes.all?.text ?? ""} done={savedNoteDone(s.id, ep.no, stamp, "all")} max={SAVED_NOTE_MAX} placeholder="この一式全体について直してほしい点・気づいたこと" />
                    <Thumbs
                      script={script}
                      src={(p) => samplePublicUrl(savedImagePath(s.id, ep.no, stamp, p))}
                      note={(p) => <SavedNote key={notes[String(p)]?.redrawnAt ?? ""} series={s.id} episode={ep.no} stamp={stamp} page={p} initial={notes[String(p)]?.text ?? ""} redrawnAt={notes[String(p)]?.redrawnAt} done={savedNoteDone(s.id, ep.no, stamp, p)} max={SAVED_NOTE_MAX} placeholder="直してほしい点" />}
                    />
                  </div>
                ))}
              </div>
            </details>
          ))}
        </section>
      ))}
    </main>
  );
}
