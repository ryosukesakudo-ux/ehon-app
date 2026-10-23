"use client";

import { useState, type ReactNode } from "react";
import type { SeriesData, SeriesVersion } from "@/lib/series-data";
import type { Combo, SeriesId } from "@/lib/story-key";

// 作り込み中のシリーズ（ヒーロー・プリンセス）の台本を、まるごと直す画面（2026-10-23 作道さん「作り込みやすいよう構造化して操作しやすく」）。
// 場面（本文3段階・絵の説明・絵の指示・カメラ）、服の形と色、登場人物・物、タッチと決まりを、タブで分けて直す。
// 上の目次（起承転結で色分け）を押すとその場面へ飛ぶ。「保存」で台本まるごとを保存し、お客様の本・絵スタジオにすぐ効く。

type Tab = "scenes" | "outfits" | "cast" | "style";
const TABS: { id: Tab; label: string }[] = [
  { id: "scenes", label: "場面と本文" },
  { id: "outfits", label: "服の形と色" },
  { id: "cast", label: "登場人物・物" },
  { id: "style", label: "タッチ・決まり" },
];
const LEVEL_LABEL = ["少ない（1〜3歳）", "普通（3〜6歳）", "多い（6〜10歳・漢字《かな》）"];
const COMBO_LABEL: Record<Combo, string> = { both: "ママとパパ", mom: "ママだけ", dad: "パパだけ", none: "子どもだけ" };
const COMBOS: Combo[] = ["both", "mom", "dad", "none"];

/** 場面の起承転結（台本のきまり：起1〜3・承4〜8・転9〜10・結11〜12） */
function phaseOf(scene: number) {
  if (scene <= 3) return { name: "起", color: "#DCE9FB" };
  if (scene <= 8) return { name: "承", color: "#DDF1E3" };
  if (scene <= 10) return { name: "転", color: "#FFE6A6" };
  return { name: "結", color: "#FBDDE8" };
}

export function StructuredEditor({ series, current, updatedAt }: { series: SeriesId; current: SeriesData; updatedAt: string | null }) {
  const [draft, setDraft] = useState(current);
  const [saved, setSaved] = useState(current);
  const [edited, setEdited] = useState(updatedAt);
  const [tab, setTab] = useState<Tab>("scenes");
  const [episodeNo, setEpisodeNo] = useState(current.episodes[0]?.no ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const epIndex = Math.max(0, draft.episodes.findIndex((e) => e.no === episodeNo));
  const ep = draft.episodes[epIndex];

  /** 台本を直す（コピーを直して入れ替える） */
  const edit = (fn: (d: SeriesData) => void) => {
    setDone("");
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  };

  async function post(data: SeriesData | null) {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await fetch("/api/admin/series/structured", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ series, data }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "保存できませんでした");
      setDraft(json.data);
      setSaved(json.data);
      setEdited(data ? new Date().toISOString() : null);
      setDone(data ? "保存しました。お客様の本と絵スタジオに使われます" : "元の台本に戻しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card" style={{ gap: 10 }}>
        <div role="radiogroup" aria-label="直す所" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button key={t.id} type="button" role="radio" className="cast-kind" aria-checked={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {draft.episodes.length > 1 && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }}>
            話
            <select value={ep.no} onChange={(e) => setEpisodeNo(Number(e.target.value))}>
              {draft.episodes.map((x) => <option key={x.no} value={x.no}>第{x.no}話「{x.title}」</option>)}
            </select>
          </label>
        )}
        {tab === "scenes" && (
          <nav aria-label="場面の目次" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <a href="#s-cover" className="tag" style={{ background: "#EEE", textDecoration: "none" }}>表紙</a>
            {ep.scenes.map((_, i) => {
              const p = phaseOf(i + 1);
              return (
                <a key={i} href={`#s-${i + 1}`} className="tag" style={{ background: p.color, textDecoration: "none", minWidth: 44, textAlign: "center" }}>
                  {p.name}{i + 1}
                </a>
              );
            })}
            <a href="#s-rules" className="tag" style={{ background: "#EEE", textDecoration: "none" }}>服装・そろえる決まり</a>
          </nav>
        )}
      </div>

      {tab === "scenes" && (
        <>
          <section id="s-cover" className="card" style={{ gap: 10, borderLeft: "6px solid #CCC" }}>
            <h2 className="display" style={{ margin: 0, fontSize: 17, color: "var(--navy)" }}>表紙</h2>
            <Field label="絵の説明（画面に出す・日本語）" value={ep.cover.label} rows={2} onChange={(v) => edit((d) => { d.episodes[epIndex].cover.label = v; })} />
            <Field label="絵の指示（AIに渡す・英語がおすすめ）" value={ep.cover.art} rows={3} mono onChange={(v) => edit((d) => { d.episodes[epIndex].cover.art = v; })} />
            <Field label="カメラ・構図（AIに渡す）" value={ep.cover.camera ?? ""} rows={2} mono onChange={(v) => edit((d) => { d.episodes[epIndex].cover.camera = v; })} />
            <Check label={`相棒（${draft.sidekickLabel}）が出る`} checked={ep.cover.withSidekick} onChange={(v) => edit((d) => { d.episodes[epIndex].cover.withSidekick = v; })} />
          </section>
          {ep.scenes.map((sc, i) => {
            const p = phaseOf(i + 1);
            const alts = COMBOS.filter((c) => sc.alt?.[c]);
            return (
              <section key={i} id={`s-${i + 1}`} className="card" style={{ gap: 10, borderLeft: `6px solid ${p.color}`, scrollMarginTop: 16 }}>
                <h2 className="display" style={{ margin: 0, fontSize: 17, color: "var(--navy)", display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="tag" style={{ background: p.color }}>{p.name}</span>場面{i + 1}
                  {i + 1 === 10 && <span style={{ fontSize: 12, color: "var(--sub)", fontWeight: 400 }}>いちばん大きな場面（見開き）</span>}
                </h2>
                <VersionFields
                  version={sc}
                  sidekickLabel={draft.sidekickLabel}
                  onChange={(fn) => edit((d) => fn(d.episodes[epIndex].scenes[i]))}
                />
                {alts.length > 0 && (
                  <details style={{ borderTop: "1px solid #eee", paddingTop: 8 }}>
                    <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>
                      写真の組み合わせで変わる版（{alts.map((c) => COMBO_LABEL[c]).join("・")}）
                    </summary>
                    <p style={{ margin: "6px 0", fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
                      上の版は「{sc.withMom && sc.withDad ? "ママとパパ" : sc.withMom ? "ママ" : sc.withDad ? "パパ" : "子どもだけ"}」の写真のときの文と絵です。ほかの写真の組み合わせのときは、下の版を使います。
                    </p>
                    {alts.map((c) => (
                      <div key={c} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 0", borderTop: "1px dashed #ddd" }}>
                        <strong style={{ fontSize: 13, color: "var(--navy)" }}>写真が「{COMBO_LABEL[c]}」のとき</strong>
                        <VersionFields
                          version={sc.alt![c]!}
                          sidekickLabel={draft.sidekickLabel}
                          onChange={(fn) => edit((d) => fn(d.episodes[epIndex].scenes[i].alt![c]!))}
                        />
                      </div>
                    ))}
                  </details>
                )}
              </section>
            );
          })}
          <section id="s-rules" className="card" style={{ gap: 10 }}>
            <h2 className="display" style={{ margin: 0, fontSize: 17, color: "var(--navy)" }}>この話の服装と、絵をそろえる決まり</h2>
            <Field
              label="服装（AIに渡す）"
              hint={draft.outfitChoices ? "{outfit} の所に、お客様が選んだ服（形と色）が入ります。ページごとの着替えは下の決まりに書きます。" : undefined}
              value={ep.outfits ?? ""}
              rows={4}
              mono
              onChange={(v) => edit((d) => { d.episodes[epIndex].outfits = v; })}
            />
            <div style={{ fontSize: 13, fontWeight: 700 }}>ページごとの決まり（表紙＝0、場面1〜12。持ち物・着替え・時間帯など）</div>
            {(ep.continuity ?? []).map((c, j) => (
              <div key={j} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 10, background: "#FBF7F0" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                  <label>ページ <PageInput value={c.from} placeholder="0" onChange={(v) => edit((d) => { d.episodes[epIndex].continuity![j].from = v; })} /></label>
                  〜
                  <label><PageInput value={c.to} placeholder="12" onChange={(v) => edit((d) => { d.episodes[epIndex].continuity![j].to = v; })} /></label>
                  <button type="button" className="ghost gray" style={{ width: "auto", height: 32, padding: "0 12px", fontSize: 12 }} onClick={() => edit((d) => { d.episodes[epIndex].continuity!.splice(j, 1); })}>
                    この決まりを消す
                  </button>
                </div>
                <Textarea value={c.text} rows={2} mono onChange={(v) => edit((d) => { d.episodes[epIndex].continuity![j].text = v; })} />
              </div>
            ))}
            <button type="button" className="ghost" style={{ width: "auto", alignSelf: "flex-start", height: 36, padding: "0 14px", fontSize: 13 }} onClick={() => edit((d) => { (d.episodes[epIndex].continuity ??= []).push({ from: 1, to: 12, text: "" }); })}>
              ＋ 決まりを足す
            </button>
          </section>
        </>
      )}

      {tab === "outfits" && draft.outfitChoices && (
        <>
          <section className="card" style={{ gap: 10 }}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
              お客様がお話の直後に選ぶ服です。形が3つ並び、形を選ぶとその形の色が並びます。形の「絵の指示」の {"{color}"} の所に、色の「絵の指示」が入ります。
              形と色の数は変えられません（注文の番号が同じ服を指すように）。服の見本の絵は、絵スタジオの「服の見本」で作り直せます。
            </p>
            <Field label="画面の見出し（例：ヒーロースーツ）" value={draft.outfitChoices.label} onChange={(v) => edit((d) => { d.outfitChoices!.label = v; })} />
          </section>
          {draft.outfitChoices.types.map((t, i) => (
            <section key={t.id} className="card" style={{ gap: 10 }}>
              <h2 className="display" style={{ margin: 0, fontSize: 17, color: "var(--navy)" }}>形{i + 1}：{t.name}</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                <Field label="名前" value={t.name} onChange={(v) => edit((d) => { d.outfitChoices!.types[i].name = v; })} />
                <Field label="短い説明（画面に出す）" value={t.note} onChange={(v) => edit((d) => { d.outfitChoices!.types[i].note = v; })} />
              </div>
              <Field label="絵の指示（AIに渡す。{color} を入れる）" value={t.look} rows={3} mono onChange={(v) => edit((d) => { d.outfitChoices!.types[i].look = v; })} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
                {t.colors.map((c, j) => (
                  <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, borderRadius: 12, background: `${c.swatch}22`, border: `2px solid ${c.swatch}` }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="color" value={c.swatch} aria-label="色見本" onChange={(e) => edit((d) => { d.outfitChoices!.types[i].colors[j].swatch = e.target.value; })} style={{ width: 40, height: 32, border: "none", background: "none" }} />
                      <Textarea value={c.name} rows={1} onChange={(v) => edit((d) => { d.outfitChoices!.types[i].colors[j].name = v; })} />
                    </div>
                    <Field label="色の絵の指示" value={c.look} rows={2} mono onChange={(v) => edit((d) => { d.outfitChoices!.types[i].colors[j].look = v; })} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {tab === "cast" && (
        <>
          <section className="card" style={{ gap: 10 }}>
            <h2 className="display" style={{ margin: 0, fontSize: 17, color: "var(--navy)" }}>相棒</h2>
            <Field label="画面での呼び方（例：相棒のロボット「ピカリ」）" value={draft.sidekickLabel} onChange={(v) => edit((d) => { d.sidekickLabel = v; })} />
            <Field label="見た目（AIに渡す）" value={draft.sidekick} rows={3} mono onChange={(v) => edit((d) => { d.sidekick = v; })} />
          </section>
          <EntriesCard
            title="名前のある登場人物"
            hint="絵の指示（英語）にこの名前が出てくる場面で、見た目の説明を足します。名前は絵の指示と同じつづりにしてください。"
            entries={draft.cast}
            onChange={(next) => edit((d) => { d.cast = next; })}
          />
          <EntriesCard
            title="何度も出てくる場所・物"
            hint="絵の指示にこの言葉が出てくる場面で、いつも同じ見た目で描くように説明を足します（大文字・小文字は区別しません）。"
            entries={draft.props ?? {}}
            onChange={(next) => edit((d) => { d.props = next; })}
          />
        </>
      )}

      {tab === "style" && (
        <section className="card" style={{ gap: 10 }}>
          <Field
            label="絵のタッチ（AIに渡す）"
            hint="お客様が選んだテイストの代わりに、このシリーズはこのタッチで描きます。作品名・キャラクター名は書かないでください（描き方だけで指定します）。"
            value={draft.style ?? ""}
            rows={8}
            mono
            onChange={(v) => edit((d) => { d.style = v; })}
          />
          <Field
            label="登場人物の決まり（AIに渡す・空なら「人間の子どもは主人公だけ」）"
            value={draft.castRules ?? ""}
            rows={5}
            mono
            onChange={(v) => edit((d) => { d.castRules = v; })}
          />
        </section>
      )}

      {/* 保存の段はいつも画面の下に出しておく */}
      <div className="card" style={{ position: "sticky", bottom: 8, zIndex: 5, flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center", boxShadow: "0 -4px 16px rgba(30,47,87,0.12)" }}>
        <button type="button" className="cta" style={{ width: "auto", height: 44, padding: "0 24px", fontSize: 15 }} disabled={busy || !dirty} onClick={() => post(draft)}>
          {busy ? "保存しています…" : "保存"}
        </button>
        {dirty && (
          <button type="button" className="ghost" style={{ width: "auto", height: 40, padding: "0 14px", fontSize: 13 }} disabled={busy} onClick={() => { setDraft(saved); setDone(""); }}>
            書いた分を取り消す
          </button>
        )}
        {edited && !dirty && (
          <button type="button" className="ghost" style={{ width: "auto", height: 40, padding: "0 14px", fontSize: 13 }} disabled={busy} onClick={() => confirm("このシリーズの台本を、直す前の元の台本に戻します（直した所はすべて消えます）。よろしいですか？") && post(null)}>
            元の台本に戻す
          </button>
        )}
        {dirty ? <span className="tag" style={{ background: "#FDECE8" }}>まだ保存していない変更があります</span> : edited && <span className="tag" style={{ background: "#FFE6A6" }}>管理画面で直した台本（{new Date(edited).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}）</span>}
        {done && <span style={{ fontSize: 13, color: "#2a8a5a" }}>{done}</span>}
        {error && <span className="error">{error}</span>}
      </div>
    </>
  );
}

/** 1つの版（場面の表の版か、写真の組み合わせ別の版）の文と絵 */
function VersionFields({ version, sidekickLabel, onChange }: { version: SeriesVersion; sidekickLabel: string; onChange: (fn: (v: SeriesVersion) => void) => void }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 8 }}>
        {version.text.map((t, l) => (
          <Field key={l} label={`本文：${LEVEL_LABEL[l]}`} value={t} rows={[3, 5, 7][l]} onChange={(v) => onChange((x) => { x.text[l] = v; })} />
        ))}
      </div>
      <Field label="絵の説明（画面に出す・日本語）" value={version.label} rows={2} onChange={(v) => onChange((x) => { x.label = v; })} />
      <Field label="絵の指示（AIに渡す・英語がおすすめ）" value={version.art} rows={3} mono onChange={(v) => onChange((x) => { x.art = v; })} />
      <Field label="カメラ・構図（AIに渡す）" value={version.camera ?? ""} rows={2} mono onChange={(v) => onChange((x) => { x.camera = v; })} />
      <Check label={`相棒（${sidekickLabel}）が出る`} checked={version.withSidekick} onChange={(v) => onChange((x) => { x.withSidekick = v; })} />
    </>
  );
}

/** 名前→見た目の一覧（登場人物・物）。足す・消す・名前を変えられる */
function EntriesCard({ title, hint, entries, onChange }: { title: string; hint: string; entries: Record<string, string>; onChange: (next: Record<string, string>) => void }) {
  const list = Object.entries(entries);
  const set = (i: number, k: string, v: string) => onChange(Object.fromEntries(list.map((e, j) => (j === i ? [k, v] : e))));
  return (
    <section className="card" style={{ gap: 10 }}>
      <h2 className="display" style={{ margin: 0, fontSize: 17, color: "var(--navy)" }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>{hint}</p>
      {list.map(([k, v], i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 10, background: "#FBF7F0" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Textarea value={k} rows={1} mono onChange={(nk) => set(i, nk, v)} />
            <button type="button" className="ghost gray" style={{ width: "auto", height: 32, padding: "0 12px", fontSize: 12, flexShrink: 0 }} onClick={() => onChange(Object.fromEntries(list.filter((_, j) => j !== i)))}>
              消す
            </button>
          </div>
          <Textarea value={v} rows={3} mono onChange={(nv) => set(i, k, nv)} />
        </div>
      ))}
      <button type="button" className="ghost" style={{ width: "auto", alignSelf: "flex-start", height: 36, padding: "0 14px", fontSize: 13 }} onClick={() => onChange({ ...entries, [`new ${list.length + 1}`]: "" })}>
        ＋ 足す
      </button>
    </section>
  );
}

function Field({ label, hint, value, rows = 1, mono, onChange }: { label: string; hint?: ReactNode; value: string; rows?: number; mono?: boolean; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, minWidth: 0 }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      {hint && <span style={{ fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>{hint}</span>}
      <Textarea value={value} rows={rows} mono={mono} onChange={onChange} />
    </label>
  );
}

function Textarea({ value, rows, mono, onChange }: { value: string; rows: number; mono?: boolean; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "inherit",
        fontSize: mono ? 12 : 14,
        lineHeight: 1.6,
        padding: 8,
        borderRadius: 8,
        border: value.trim() ? "1px solid #ccc" : "2px solid var(--coral, #F08A6C)",
        resize: "vertical",
        background: mono ? "#FAFAFC" : "#fff",
      }}
    />
  );
}

function PageInput({ value, placeholder, onChange }: { value: number | undefined; placeholder: string; onChange: (v: number | undefined) => void }) {
  return (
    <input
      type="number"
      min={0}
      max={12}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Math.max(0, Math.min(12, Math.round(Number(e.target.value)))))}
      style={{ width: 56, height: 32, fontSize: 14, padding: "0 6px" }}
    />
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
