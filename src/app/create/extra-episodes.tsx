"use client";

import { useEffect, useState } from "react";
import { COVER_SCENE, FIRST_PAGES } from "@/lib/catalog";
import { chosenExtras, useFlow } from "./flow";

type Choice = { no: number; title: string; season: string };

/** ほかの話のプレビューで作る絵：表紙と最初の3ページ */
const EXTRA_PREVIEW_SCENES = [COVER_SCENE, ...Array.from({ length: FIRST_PAGES }, (_, i) => i)];

/**
 * 2話目以降のまとめ買い（2026-10-16 作道さん）。注文の前に「2話目以降もつくりますか？」を聞く。
 * つくらなければそのまま支払いへ。つくるなら同じシリーズの話を選び、選んだ話の分まとめて買える（1話＝1冊、部数はどの話も同じ）。
 * プレビューは選択制。見ない話の絵は、支払いのあとに作って確認してから印刷する。
 */
export function ExtraEpisodes() {
  const { state, update } = useFlow();
  const [series, setSeries] = useState<string>("");
  const [current, setCurrent] = useState<number | null>(null);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const extras = chosenExtras(state);
  // 「この話だけ／ほかの話もつくる」の選択。まだ押していなければ、選んだ話があるかどうかで決める（保存した入力の復元のあとでも合うように）
  const [picked, setWants] = useState<boolean | null>(null);
  const wants = picked ?? (extras.length ? true : null);

  useEffect(() => {
    if (!state.draftId || state.demo) return;
    let alive = true;
    fetch(`/api/drafts/${encodeURIComponent(state.draftId)}/episodes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        setSeries(j?.series ?? "");
        setCurrent(j?.current ?? null);
        const list: Choice[] = j?.episodes ?? [];
        setChoices(list);
        // 選べなくなった話は外す
        if (extras.some((n) => !list.some((c) => c.no === n))) update({ extraEpisodes: extras.filter((n) => list.some((c) => c.no === n)) });
      })
      .catch(() => alive && setChoices([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 下書きが変わったときだけ読み直す
  }, [state.draftId, state.demo]);

  if (!choices?.length) return null;

  const toggle = (no: number) => {
    const next = extras.includes(no) ? extras.filter((n) => n !== no) : [...extras, no].sort((a, b) => a - b);
    update({ extraEpisodes: next, extraFor: state.draftId ?? "" });
  };

  return (
    <section className="card" style={{ padding: 18, gap: 12, border: "2px solid var(--coral)" }}>
      <div className="display" style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>2話目以降もつくりますか？</div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--sub)" }}>
        「{series}」のほかのお話も、同じ主人公・同じ家族でまとめてつくれます。1話ごとに1冊（36ページ）で、2冊目からは1冊ずつ1,000円引き。同じ箱でお届けします。
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="choice"
          aria-pressed={wants === false}
          style={{ flex: 1, justifyContent: "center", padding: 12 }}
          onClick={() => {
            setWants(false);
            update({ extraEpisodes: [], extraFor: state.draftId ?? "" });
          }}
        >
          <span className="choice-title display" style={{ fontSize: 15 }}>この話だけ</span>
        </button>
        <button type="button" className="choice" aria-pressed={wants === true} style={{ flex: 1, justifyContent: "center", padding: 12 }} onClick={() => setWants(true)}>
          <span className="choice-title display" style={{ fontSize: 15 }}>ほかの話もつくる</span>
        </button>
      </div>
      {wants && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {current && <div style={{ fontSize: 13, color: "var(--sub)" }}>第{current}話（いま作っているお話）は必ず入ります。</div>}
          {choices.map((c) => (
            <div key={c.no} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 14, background: "#FBF7F0", border: "1px solid var(--line)" }}>
              <label className="consent" style={{ alignItems: "center", fontSize: 14 }}>
                <input type="checkbox" checked={extras.includes(c.no)} onChange={() => toggle(c.no)} />
                <span>
                  <b>第{c.no}話「{c.title}」</b>
                  <span style={{ color: "var(--sub)" }}>（{c.season}）</span>
                </span>
              </label>
              {extras.includes(c.no) && <ExtraPreview episode={c.no} />}
            </div>
          ))}
          {extras.length > 0 && (
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
              プレビューを見なかったお話は、お支払いのあとに絵を仕上げ、スタッフが確認してから印刷します。
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** ほかの話のプレビュー（任意）：表紙と最初の3ページを作って見る。プレビュー4枚分を使う */
function ExtraPreview({ episode }: { episode: number }) {
  const { state, update } = useFlow();
  const extraId = state.extraDrafts[episode] ?? null;
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 前に作ったプレビューがあれば読み直す（絵のURLは1時間で切れる）
  useEffect(() => {
    if (!extraId) return;
    let alive = true;
    fetch(`/api/drafts/${encodeURIComponent(extraId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && j?.previews && setUrls(j.previews))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [extraId]);

  async function make() {
    if (!state.draftId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(state.draftId)}/episodes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ episode, draftId: extraId }),
      });
      const json = await res.json();
      if (!res.ok || !json.draftId) throw new Error(json.error ?? "プレビューを作れませんでした");
      const id = json.draftId as string;
      update((prev) => ({ extraDrafts: { ...prev.extraDrafts, [episode]: id } }));
      for (const scene of EXTRA_PREVIEW_SCENES) {
        if (urls[scene]) continue;
        const r = await fetch(`/api/drafts/${encodeURIComponent(id)}/scenes/${scene}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ likeness: state.likeness }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "絵の作成に失敗しました");
        setUrls((u) => ({ ...u, [scene]: j.url }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "プレビューを作れませんでした");
    } finally {
      setBusy(false);
    }
  }

  const shown = EXTRA_PREVIEW_SCENES.filter((s) => urls[s]);
  const done = shown.length === EXTRA_PREVIEW_SCENES.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {shown.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
          {shown.map((s) => (
            // eslint-disable-next-line @next/next/no-img-element -- 署名付きURLの一時画像
            <img key={s} src={urls[s]} alt={s === COVER_SCENE ? "表紙" : `${s + 1}ページ`} style={{ width: "100%", aspectRatio: "3 / 2", objectFit: "contain", background: "#fff", borderRadius: 8 }} />
          ))}
        </div>
      )}
      {!done && (
        <button type="button" className="ghost" style={{ height: 40, fontSize: 13 }} disabled={busy} onClick={make}>
          {busy ? "絵を描いています…" : shown.length ? "プレビューの続きを作る" : "プレビューを見る（表紙と3ページ・4枚分）"}
        </button>
      )}
      {!shown.length && !busy && <div style={{ fontSize: 12, color: "var(--sub)" }}>プレビューは見なくても注文できます。</div>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
