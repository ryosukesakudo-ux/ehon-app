"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { COVER_SCENE, MEMBER_MONTHLY_PREVIEWS, PREVIEW_PACK, bookTitle, yen, getStory, sceneText } from "@/lib/catalog";
import { BookCover } from "@/components/book-cover";
import { Chevron } from "@/components/icons";
import { Lottie } from "@/components/lottie";
import { BuyPreviewsButton } from "@/components/buy-previews";
import { useFlow } from "../flow";
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

  const story = getStory(state.story)!;
  const scenes = state.previewScenes;
  const scene = scenes[pos];
  const isCover = scene === COVER_SCENE;
  const title = bookTitle(state.story, state.childName);

  async function generate(index: number) {
    if (!state.draftId || inFlight.current.has(index)) return;
    inFlight.current.add(index);
    setLoading((l) => ({ ...l, [index]: true }));
    setFailed((f) => {
      const next = { ...f };
      delete next[index];
      return next;
    });
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(state.draftId)}/scenes/${index}`, { method: "POST" });
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "絵の作成に失敗しました");
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
      <img src={url} alt={isCover ? "表紙の絵" : `${pos + 1}枚目の挿絵`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
        <StepTitle title="できあがりを確認してください" lead="気になるページは、絵だけ作り直せます。" />
        {state.demo && (
          <p className="demo-note">デモモードで動いています。実際の絵の代わりに仮の画像を表示しています。</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", borderRadius: 18, overflow: "hidden", background: "#fff", border: "1px solid var(--line)" }}>
          {isCover ? (
            <BookCover lead={title.lead} title={title.main} art={picture} />
          ) : (
            <div style={{ aspectRatio: "1 / 1", background: "#E6EEF9", display: "flex", alignItems: "center", justifyContent: "center" }}>{picture}</div>
          )}
          <p style={{ margin: 0, padding: 18, fontSize: 16, lineHeight: 1.9 }}>
            {scene === undefined ? "" : isCover ? "表紙" : sceneText(story.scenes[scene], state.childName)}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button type="button" className="ghost" aria-label="前のページ" style={{ width: 44, height: 44, padding: 0, borderRadius: 22 }} disabled={pos === 0} onClick={() => setPos(pos - 1)}>
            <Chevron dir="left" size={20} />
          </button>
          <div style={{ fontSize: 14, color: "var(--sub)" }}>
            見本 {pos + 1} / {scenes.length || 3}
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
          <button type="button" className="ghost" disabled={scene === undefined || !!loading[scene] || (account?.loggedIn && account.remaining <= 0)} onClick={() => generate(scene)}>
            {isCover ? "表紙の絵を作り直す" : "このページの絵を作り直す"}
          </button>
        )}
        {account?.loggedIn && (
          <p className="step-lead" style={{ textAlign: "center", fontSize: 13 }}>
            プレビュー残り：{account.remaining}枚
            {typeof account.free === "number" && `（今月の無料 ${account.free} / ${account.limit}枚${account.credits ? `＋追加 ${account.credits}枚` : ""}）`}
          </p>
        )}
        {boughtCredits && <p className="info-note" role="status">ご購入ありがとうございます。反映まで少しかかる場合は、画面を再読み込みしてください。</p>}
        {account?.loggedIn && account.remaining <= 0 && <BuyPreviewsButton returnTo="/create/preview" />}
        {error && <p className="error" role="alert">{error}</p>}
        {needLogin && !trial && (
          <Link href={loginHref("/create/preview")} className="ghost">無料会員登録・ログインへ</Link>
        )}
        <p className="step-lead">ここでは表紙と一部のページを見本としてお見せしています。残りのページは、ご注文後に同じタッチで仕上げます。</p>
      </main>
      {trial ? (
        <NextButton href={loginHref("/create/size")} disabled={!allDone}>無料会員登録して注文へ進む</NextButton>
      ) : (
        <NextButton href="/create/size" disabled={!allDone}>この内容で進む</NextButton>
      )}
    </>
  );
}
