"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MEMBER_MONTHLY_PREVIEWS, PREVIEW_SCENES, getStory, sceneText } from "@/lib/catalog";
import { Chevron } from "@/components/icons";
import { useFlow } from "../flow";
import { loginHref, useAccount } from "../account";
import { NextButton, StepHeader, StepTitle } from "../step";

export default function PreviewPage() {
  const router = useRouter();
  const { state, setPreview, ready } = useFlow();
  const [pos, setPos] = useState(0);
  const [loading, setLoading] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [account, setAccount] = useAccount();
  // 登録前のお試し（Supabase 設定済みで未ログイン）
  const trial = !!account?.configured && !account.loggedIn;
  const inFlight = useRef(new Set<number>());

  const story = getStory(state.story)!;
  const scene = PREVIEW_SCENES[pos];

  async function generate(index: number) {
    if (!state.draftId || inFlight.current.has(index)) return;
    inFlight.current.add(index);
    setLoading((l) => ({ ...l, [index]: true }));
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(state.draftId)}/scenes/${index}`, { method: "POST" });
      const json = await res.json();
      if (typeof json.remaining === "number") {
        setAccount((a) => (a?.loggedIn ? { ...a, remaining: json.remaining } : a));
      }
      if (!res.ok) {
        setNeedLogin(!!json.needLogin);
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
    // 足りない見本の絵の作成をサーバーに依頼する（読み込み中の表示もここで切り替わる）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    for (const i of PREVIEW_SCENES) if (!state.previews[i]) generate(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 画面を開いたときに一度だけ作る
  }, [ready, state.draftId]);

  const url = state.previews[scene];
  const allDone = PREVIEW_SCENES.every((i) => state.previews[i]);

  return (
    <>
      <StepHeader step={4} back="/create/photo" />
      <main className="step-body">
        <StepTitle title="できあがりを確認してください" lead="気になるページは、絵だけ作り直せます。" />
        {state.demo && (
          <p className="demo-note">デモモードで動いています。実際の絵の代わりに仮の画像を表示しています。</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", borderRadius: 18, overflow: "hidden", background: "#fff", border: "1px solid var(--line)" }}>
          <div style={{ aspectRatio: "1 / 1", background: "#E6EEF9", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {url && !loading[scene] ? (
              // eslint-disable-next-line @next/next/no-img-element -- 署名付きURLの一時画像
              <img src={url} alt={`${pos + 1}枚目の挿絵`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--sub)", fontSize: 13 }}>
                <div className="spinner" />
                <span>絵をかいています…（1分ほどかかります）</span>
              </div>
            )}
          </div>
          <p style={{ margin: 0, padding: 18, fontSize: 16, lineHeight: 1.9 }}>
            {sceneText(story.scenes[scene], state.childName)}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button type="button" className="ghost" aria-label="前のページ" style={{ width: 44, height: 44, padding: 0, borderRadius: 22 }} disabled={pos === 0} onClick={() => setPos(pos - 1)}>
            <Chevron dir="left" size={20} />
          </button>
          <div style={{ fontSize: 14, color: "var(--sub)" }}>
            見本 {pos + 1} / {PREVIEW_SCENES.length}
          </div>
          <button type="button" className="ghost" aria-label="次のページ" style={{ width: 44, height: 44, padding: 0, borderRadius: 22 }} disabled={pos === PREVIEW_SCENES.length - 1} onClick={() => setPos(pos + 1)}>
            <Chevron dir="right" size={20} />
          </button>
        </div>
        {trial ? (
          <Link href={loginHref("/create/preview")} className="ghost">
            作り直しは無料会員登録で（月{MEMBER_MONTHLY_PREVIEWS}枚まで）
          </Link>
        ) : (
          <button type="button" className="ghost" disabled={!!loading[scene] || (account?.loggedIn && account.remaining <= 0)} onClick={() => generate(scene)}>
            このページの絵を作り直す
          </button>
        )}
        {account?.loggedIn && (
          <p className="step-lead" style={{ textAlign: "center", fontSize: 13 }}>今月のプレビュー残り：{account.remaining} / {account.limit}枚</p>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        {needLogin && !trial && (
          <Link href={loginHref("/create/preview")} className="ghost">無料会員登録・ログインへ</Link>
        )}
        <p className="step-lead">ここでは一部のページを見本としてお見せしています。残りのページは、ご注文後に同じタッチで仕上げます。</p>
      </main>
      {trial ? (
        <NextButton href={loginHref("/create/size")} disabled={!allDone}>無料会員登録して注文へ進む</NextButton>
      ) : (
        <NextButton href="/create/size" disabled={!allDone}>この内容で進む</NextButton>
      )}
    </>
  );
}
