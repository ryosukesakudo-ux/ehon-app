"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { COVER_SCENE, MEMBER_MONTHLY_PREVIEWS, PERSON_LABEL, PREVIEW_PACK, REDO_NOTE_MAX, REDO_OPTIONS, characterOf, yen, type LikenessId, type RedoOptionId } from "@/lib/catalog";
import { bookTitle } from "@/lib/story-key";
import { BookCover } from "@/components/book-cover";
import { Chevron } from "@/components/icons";
import { Lottie } from "@/components/lottie";
import { BuyPreviewsButton } from "@/components/buy-previews";
import { useFlow } from "../flow";
import { LikenessPicker } from "../likeness-picker";
import { loginHref, useAccount } from "../account";
import { NextButton, StepHeader, StepTitle } from "../step";

export default function PreviewPage() {
  return (
    <Suspense>
      <Preview />
    </Suspense>
  );
}

function Preview() {
  const router = useRouter();
  const { state, setPreview, update, ready } = useFlow();
  const [pos, setPos] = useState(0);
  const [loading, setLoading] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  // 描けなかった絵とその理由（使い切り・会員登録が必要・その他の失敗）
  const [failed, setFailed] = useState<Record<number, "quota" | "login" | "error">>({});
  const [account, setAccount, refreshAccount] = useAccount();
  const boughtCredits = useSearchParams().get("credits") === "done";
  // 登録前のお試し（Supabase 設定済みで未ログイン）
  const trial = !!account?.configured && !account.loggedIn;
  const inFlight = useRef(new Set<number>());
  // 作り直しの指示（選択肢と一言）
  const [options, setOptions] = useState<RedoOptionId[]>([]);
  const [note, setNote] = useState("");
  // 本人への似せ方（写真の画面で選んだもの。作り直しのときに変えられ、変えたら次からもそれを使う）
  const likeness = state.likeness;

  const scenes = state.previewScenes;
  const scene = scenes[pos];
  const isCover = scene === COVER_SCENE;
  const who = scene === undefined ? null : characterOf(scene);
  const title = bookTitle(state.story, state.childName);
  const whoName = who === "child" ? state.childName || PERSON_LABEL.child : who ? PERSON_LABEL[who] : "";

  type RedoRequest = { options: RedoOptionId[]; note: string; likeness: LikenessId };

  async function generate(index: number, redo?: RedoRequest): Promise<boolean> {
    if (!state.draftId || inFlight.current.has(index)) return false;
    inFlight.current.add(index);
    setLoading((l) => ({ ...l, [index]: true }));
    setFailed((f) => {
      const next = { ...f };
      delete next[index];
      return next;
    });
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(state.draftId)}/scenes/${index}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(redo ? { ...redo, redo: true } : { likeness }),
      });
      const json = await res.json();
      if (typeof json.remaining === "number") {
        setAccount((a) => (a?.loggedIn ? { ...a, remaining: json.remaining } : a));
        refreshAccount();
      }
      if (!res.ok) {
        setNeedLogin(!!json.needLogin);
        setFailed((f) => ({ ...f, [index]: json.needCredits || res.status === 429 ? "quota" : json.needLogin ? "login" : "error" }));
        throw new Error(json.error ?? "絵の作成に失敗しました");
      }
      setPreview(index, json.url);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "絵の作成に失敗しました");
      return false;
    } finally {
      inFlight.current.delete(index);
      setLoading((l) => ({ ...l, [index]: false }));
    }
  }

  useEffect(() => {
    if (!ready) return;
    if (!state.draftId) {
      router.replace("/create/photo");
      return;
    }
    // 以前の画面で作った下書きなど、プレビューの場面が分からないときはサーバーに聞く
    if (!scenes.length) {
      fetch(`/api/drafts/${encodeURIComponent(state.draftId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => json?.previewScenes && update({ previewScenes: json.previewScenes }))
        .catch(() => {});
      return;
    }
    // 足りない見本の絵の作成をサーバーに依頼する（読み込み中の表示もここで切り替わる）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    for (const i of scenes) if (!state.previews[i]) generate(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 画面を開いたとき（と場面が分かったとき）に一度だけ作る
  }, [ready, state.draftId, scenes.length]);

  // 作り直し：いま見ている絵だけ、または家族（登場人物）全員をまとめて。うまくいったら選択肢と一言を空にする
  const people = scenes.filter((i) => characterOf(i));
  const remaining = account?.loggedIn ? account.remaining : Infinity;
  async function redoScenes(targets: number[]) {
    const req = { options, note: note.trim(), likeness };
    const results = await Promise.all(targets.map((i) => generate(i, req)));
    if (results.every(Boolean)) {
      setOptions([]);
      setNote("");
    }
  }

  const url = scene === undefined ? undefined : state.previews[scene];
  const allDone = scenes.length > 0 && scenes.every((i) => state.previews[i]);
  const failure = scene === undefined || url || loading[scene] ? undefined : failed[scene];
  const picture =
    failure ? (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 24, textAlign: "center", color: "var(--navy)" }}>
        <div className="display" style={{ fontSize: 17, fontWeight: 900 }}>
          {failure === "quota"
            ? "プレビューを使い切ったため、この絵は描けませんでした"
            : failure === "login"
              ? "この絵は無料会員登録のあとに描けます"
              : "この絵を描けませんでした"}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--sub)" }}>
          {failure === "quota"
            ? `下のボタンから${PREVIEW_PACK.credits}枚追加（${yen(PREVIEW_PACK.price)}）するか、来月1日に無料分が戻ってから作れます。`
            : failure === "login"
              ? "下のボタンから登録・ログインしてください。"
              : "時間をおいて「作り直す」を押してください。"}
        </div>
      </div>
    ) : url && !loading[scene] ? (
      // eslint-disable-next-line @next/next/no-img-element -- 署名付きURLの一時画像
      <img src={url} alt={isCover ? "表紙の絵" : `${whoName}のキャラクター`} style={{ width: "100%", height: "100%", objectFit: who ? "contain" : "cover" }} />
    ) : (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--sub)", fontSize: 13 }}>
        <Lottie name="drawing" style={{ width: 200, height: 150 }} />
        <span>絵をかいています…（1分ほどかかります）</span>
      </div>
    );

  return (
    <>
      <StepHeader step={4} back="/create/photo" />
      <main className="step-body">
        <StepTitle title="表紙と登場人物を確認してください" lead="気になる絵は、直したいところを選んで作り直せます。" />
        {state.demo && (
          <p className="demo-note">デモモードで動いています。実際の絵の代わりに仮の画像を表示しています。</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", borderRadius: 18, overflow: "hidden", background: "#fff", border: "1px solid var(--line)" }}>
          {isCover ? (
            <BookCover lead={title.lead} title={title.main} art={picture} />
          ) : (
            <div style={{ aspectRatio: "1 / 1", background: who ? "#fff" : "#E6EEF9", display: "flex", alignItems: "center", justifyContent: "center" }}>{picture}</div>
          )}
          <p style={{ margin: 0, padding: 18, fontSize: 16, lineHeight: 1.9 }}>
            {scene === undefined ? (
              ""
            ) : isCover ? (
              "表紙"
            ) : who ? (
              <>
                <strong>{whoName}のキャラクター</strong>
                <br />
                <span style={{ fontSize: 13, color: "var(--sub)" }}>この姿をもとに、絵本の全ページを描きます。</span>
              </>
            ) : (
              ""
            )}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button type="button" className="ghost" aria-label="前のページ" style={{ width: 44, height: 44, padding: 0, borderRadius: 22 }} disabled={pos === 0} onClick={() => setPos(pos - 1)}>
            <Chevron dir="left" size={20} />
          </button>
          <div style={{ fontSize: 14, color: "var(--sub)" }}>
            見本 {pos + 1} / {scenes.length || 2}
          </div>
          <button type="button" className="ghost" aria-label="次のページ" style={{ width: 44, height: 44, padding: 0, borderRadius: 22 }} disabled={pos >= scenes.length - 1} onClick={() => setPos(pos + 1)}>
            <Chevron dir="right" size={20} />
          </button>
        </div>
        {trial ? (
          <Link href={loginHref("/create/preview")} className="ghost">
            作り直しは無料会員登録で（月{MEMBER_MONTHLY_PREVIEWS}枚まで）
          </Link>
        ) : (
          <section className="card" style={{ gap: 10 }}>
            <div className="display" style={{ fontSize: 15, fontWeight: 800, color: "var(--navy)" }}>
              {isCover ? "表紙の絵を作り直す" : who ? `${whoName}のキャラクターを作り直す` : "このページの絵を作り直す"}
            </div>
            <div style={{ fontSize: 12, color: "var(--sub)" }}>直したいところを選んでください（いくつでも・選ばなくても作り直せます）</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {REDO_OPTIONS.map((o) => {
                const on = options.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setOptions((v) => (on ? v.filter((x) => x !== o.id) : [...v, o.id]))}
                    style={{ height: 36, padding: "0 14px", borderRadius: 18, fontSize: 13, cursor: "pointer", border: on ? "2px solid var(--coral)" : "1px solid var(--line)", background: on ? "#FDECE8" : "#fff", color: "var(--navy)", fontWeight: on ? 700 : 500 }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--sub)" }}>
              ひとこと（任意・{REDO_NOTE_MAX}文字まで）
              <input
                type="text"
                value={note}
                maxLength={REDO_NOTE_MAX}
                placeholder="例：メガネをかけて／前髪を短く"
                onChange={(e) => setNote([...e.target.value].slice(0, REDO_NOTE_MAX).join(""))}
                style={{ height: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 16 }}
              />
              <span style={{ alignSelf: "flex-end" }}>{[...note].length} / {REDO_NOTE_MAX}</span>
            </label>
            <LikenessPicker value={likeness} onChange={(v) => update({ likeness: v })} />
            <button
              type="button"
              className="ghost"
              disabled={scene === undefined || !!loading[scene] || remaining <= 0}
              onClick={() => redoScenes([scene])}
            >
              {options.length || note.trim() || likeness !== "normal" ? "この内容で作り直す" : "そのまま作り直す"}（プレビュー1枚）
            </button>
            {people.length > 1 && (
              <>
                <button
                  type="button"
                  className="ghost"
                  disabled={people.some((i) => loading[i]) || remaining < people.length}
                  onClick={() => redoScenes(people)}
                >
                  家族{people.length}人まとめて作り直す（{people.length}枚）
                </button>
                <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
                  {people.map((i) => {
                    const p = characterOf(i)!;
                    return p === "child" ? state.childName || PERSON_LABEL.child : PERSON_LABEL[p];
                  }).join("・")}
                  のキャラクターを、上で選んだ内容でいっしょに作り直します。
                  {remaining < people.length && `（プレビューの残りが${people.length}枚以上必要です。下のボタンで追加できます）`}
                </div>
              </>
            )}
          </section>
        )}
        {account?.loggedIn && (
          <p className="step-lead" style={{ textAlign: "center", fontSize: 13 }}>
            プレビュー残り：{account.remaining}枚
            {typeof account.free === "number" && `（今月の無料 ${account.free} / ${account.limit}枚${account.credits ? `＋追加 ${account.credits}枚` : ""}）`}
          </p>
        )}
        {boughtCredits && <p className="info-note" role="status">ご購入ありがとうございます。反映まで少しかかる場合は、下の「画面を再読み込み」を押してください。</p>}
        {/* 残りが無いとき、または家族まとめて作り直すには足りないときは、追加のボタンを出す */}
        {account?.loggedIn && (account.remaining <= 0 || (people.length > 1 && account.remaining < people.length)) && <BuyPreviewsButton returnTo="/create/preview" />}
        <button
          type="button"
          className="ghost"
          style={{ alignSelf: "center", height: 40, padding: "0 18px", fontSize: 14, gap: 6 }}
          onClick={() => window.location.reload()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          画面を再読み込み
        </button>
        {error && <p className="error" role="alert">{error}</p>}
        {needLogin && !trial && (
          <Link href={loginHref("/create/preview")} className="ghost">無料会員登録・ログインへ</Link>
        )}
        <p className="step-lead">ここでは表紙と登場人物のキャラクターをお見せしています。本文のページは、ご注文後にこのキャラクターをもとに同じタッチで仕上げます。</p>
      </main>
      {trial ? (
        <NextButton href={loginHref("/create/size")} disabled={!allDone}>無料会員登録して注文へ進む</NextButton>
      ) : (
        <NextButton href="/create/size" disabled={!allDone}>この内容で進む</NextButton>
      )}
    </>
  );
}
