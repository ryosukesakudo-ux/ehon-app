"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DELIVERY_MAX_DAYS,
  DELIVERY_MIN_DAYS,
  DELIVERY_TIMES,
  extraCopyPrice,
  getSize,
  getStory,
  getTaste,
  jstDate,
  orderTotal,
  yen,
} from "@/lib/catalog";
import type { Coupon } from "@/lib/coupons";
import { useFlow } from "../flow";
import { NextButton, StepHeader, StepTitle } from "../step";

export default function CheckoutPage() {
  const router = useRouter();
  const { state, update } = useFlow();
  const minDate = jstDate(DELIVERY_MIN_DAYS);
  const maxDate = jstDate(DELIVERY_MAX_DAYS);
  const dateOk = !state.deliveryDate || (state.deliveryDate >= minDate && state.deliveryDate <= maxDate);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const size = getSize(state.size)!;
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const firstPrice = coupon ? Math.min(coupon.bookPrice, size.price) : size.price;

  async function applyCoupon() {
    setChecking(true);
    setCouponError(null);
    try {
      const res = await fetch(`/api/coupons?code=${encodeURIComponent(couponInput)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "クーポンを確認できませんでした");
      setCoupon(json);
    } catch (e) {
      setCouponError(e instanceof Error ? e.message : "クーポンを確認できませんでした");
    } finally {
      setChecking(false);
    }
  }

  async function pay() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draftId: state.draftId,
          size: state.size,
          copies: state.copies,
          coupon: coupon?.code ?? "",
          deliveryDate: state.deliveryDate,
          deliveryTime: state.deliveryTime,
        }),
      });
      const json = await res.json();
      if (json.needLogin) {
        router.push(`/login?next=${encodeURIComponent("/create/checkout")}`);
        return;
      }
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
          <div className="sum-row"><span>主人公</span><span>{state.childName}{state.childAge ? `（${state.childAge}さい）` : ""}</span></div>
          <div className="sum-row"><span>サイズ</span><span>{size.name}（{size.spec}）</span></div>
          <div className="divider" />
          <div className="sum-row"><span>絵本</span><span>{yen(size.price)}</span></div>
          {coupon && <div className="sum-row" style={{ color: "var(--coral)" }}><span>クーポン（{coupon.label}）</span><span>−{yen(size.price - firstPrice)}</span></div>}
          {state.copies > 1 && <div className="sum-row"><span>追加の{state.copies - 1}冊</span><span>{yen(extraCopyPrice(state.size) * (state.copies - 1))}</span></div>}
          <div className="sum-row"><span>送料</span><span>0円</span></div>
          <div className="sum-total">
            <span className="display" style={{ fontSize: 15, fontWeight: 800 }}>合計（税込）</span>
            <span className="display" style={{ fontSize: 26, fontWeight: 900, color: "var(--coral)" }}>{yen(orderTotal(state.size, state.copies, firstPrice))}</span>
          </div>
        </div>
        <div className="card" style={{ padding: 18, gap: 10 }}>
          <div className="display" style={{ fontSize: 15, fontWeight: 800, color: "var(--navy)" }}>クーポンコード</div>
          {coupon ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 14 }}>「{coupon.code}」を使います（{coupon.label}）</span>
              <button type="button" className="ghost" style={{ height: 36, padding: "0 14px", fontSize: 13, flexShrink: 0 }} onClick={() => setCoupon(null)}>
                取り消す
              </button>
            </div>
          ) : (
            <form
              className="field"
              style={{ flexDirection: "row", gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                applyCoupon();
              }}
            >
              <input
                type="text"
                aria-label="クーポンコード"
                placeholder="お持ちの方のみ"
                autoCapitalize="characters"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                style={{ flexGrow: 1, minWidth: 0 }}
              />
              <button type="submit" className="ghost" style={{ height: 48, padding: "0 18px", flexShrink: 0 }} disabled={checking || !couponInput.trim()}>
                {checking ? "確認中…" : "使う"}
              </button>
            </form>
          )}
          {couponError && <p className="error" role="alert">{couponError}</p>}
          {coupon && state.copies > 1 && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--sub)" }}>クーポンは1冊目に使えます。追加の冊数は通常の値段です。</p>
          )}
        </div>
        <div className="card" style={{ padding: 18, gap: 12 }}>
          <div className="display" style={{ fontSize: 15, fontWeight: 800, color: "var(--navy)" }}>お届け日時</div>
          <div className="field">
            <label htmlFor="delivery-date">お届け希望日</label>
            <input
              id="delivery-date"
              type="date"
              min={minDate}
              max={maxDate}
              value={state.deliveryDate}
              onChange={(e) => update({ deliveryDate: e.target.value })}
            />
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
              ご注文日から{DELIVERY_MIN_DAYS}日後以降の日付を選べます。空欄のときは、できあがり次第お届けします。
            </p>
            {state.deliveryDate && (
              <button type="button" className="ghost" style={{ alignSelf: "flex-start", height: 36, padding: "0 14px", fontSize: 13 }} onClick={() => update({ deliveryDate: "" })}>
                日付の指定をやめる
              </button>
            )}
            {!dateOk && <p className="error" role="alert">{DELIVERY_MIN_DAYS}日後から{DELIVERY_MAX_DAYS}日後までの日付を選んでください</p>}
          </div>
          <div className="field">
            <label htmlFor="delivery-time">時間帯</label>
            <select id="delivery-time" value={state.deliveryTime} onChange={(e) => update({ deliveryTime: e.target.value })}>
              <option value="">指定なし</option>
              {DELIVERY_TIMES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--sub)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <span>カード・Apple Pay・Google Pay・コンビニ払い・PayPay に対応。決済サービス（Stripe）の安全な画面で入力します</span>
        </div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: "var(--sub)" }}>
          ご注文前に<a href="/legal" target="_blank">特定商取引法に基づく表記</a>・<a href="/terms" target="_blank">利用規約</a>・<a href="/privacy" target="_blank">プライバシーポリシー</a>をご確認ください。お支払いに進むと、利用規約に同意したものとします。
        </p>
        {error && <p className="error" role="alert">{error}</p>}
      </main>
      <NextButton onClick={pay} disabled={sending || !state.draftId || !dateOk}>
        {sending ? "決済画面を開いています…" : "お届け先とお支払いへ"}
      </NextButton>
    </>
  );
}
