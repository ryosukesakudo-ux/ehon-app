"use client";

import { useState } from "react";
import { getSize, getStory, getTaste, orderTotal, yen, EXTRA_COPY_PRICE } from "@/lib/catalog";
import { useFlow } from "../flow";
import { NextButton, StepHeader, StepTitle } from "../step";

export default function CheckoutPage() {
  const { state } = useFlow();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const size = getSize(state.size)!;

  async function pay() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftId: state.draftId, size: state.size, extraCopy: state.extraCopy }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "決済画面を開けませんでした");
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "決済画面を開けませんでした");
      setSending(false);
    }
  }

  return (
    <>
      <StepHeader step={6} back="/create/size" />
      <main className="step-body">
        <StepTitle title="ご注文内容の確認" lead="お届け先とお支払い方法は、次の画面で入力します。" />
        <div className="card" style={{ padding: 18 }}>
          <div className="display" style={{ fontSize: 15, fontWeight: 800, color: "var(--navy)" }}>ご注文内容</div>
          <div className="sum-row"><span>お話</span><span>{getStory(state.story)?.name}</span></div>
          <div className="sum-row"><span>テイスト</span><span>{getTaste(state.taste)?.name}</span></div>
          <div className="sum-row"><span>主人公</span><span>{state.childName}</span></div>
          <div className="sum-row"><span>サイズ</span><span>{size.name}（{size.spec}）</span></div>
          <div className="divider" />
          <div className="sum-row"><span>絵本</span><span>{yen(size.price)}</span></div>
          {state.extraCopy && <div className="sum-row"><span>追加の1冊</span><span>{yen(EXTRA_COPY_PRICE)}</span></div>}
          <div className="sum-row"><span>送料</span><span>0円</span></div>
          <div className="sum-total">
            <span className="display" style={{ fontSize: 15, fontWeight: 800 }}>合計（税込）</span>
            <span className="display" style={{ fontSize: 26, fontWeight: 900, color: "var(--coral)" }}>{yen(orderTotal(state.size, state.extraCopy))}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--sub)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <span>カード情報は決済サービス（Stripe）の安全な画面で入力します</span>
        </div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: "var(--sub)" }}>
          ご注文前に<a href="/legal" target="_blank">特定商取引法に基づく表記</a>と<a href="/privacy" target="_blank">プライバシーポリシー</a>をご確認ください。
        </p>
        {error && <p className="error" role="alert">{error}</p>}
      </main>
      <NextButton onClick={pay} disabled={sending || !state.draftId}>
        {sending ? "決済画面を開いています…" : "お届け先とお支払いへ"}
      </NextButton>
    </>
  );
}
