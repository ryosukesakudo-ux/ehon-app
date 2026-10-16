"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BOOK_MESSAGE_MAX,
  DELIVERY_MAX_DAYS,
  DELIVERY_MIN_DAYS,
  dateLabel,
  extraCopyPrice,
  firstBookPrice,
  getSize,
  getTaste,
  jstDate,
  orderTotal,
  yen,
} from "@/lib/catalog";
import type { Coupon } from "@/lib/coupons";
import { levelLabel, parseSeriesKey, seriesKey, storyLabel } from "@/lib/story-key";
import { DatePicker } from "@/components/date-picker";
import { toViewablePhoto } from "@/lib/heic-photo";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { chosenExtras, useFlow } from "../flow";
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
  const firstPrice = firstBookPrice(size.price, coupon);
  // まとめて買うほかの話（1話＝1冊。どの話も同じ部数）
  const extras = chosenExtras(state);
  const books = state.copies * (1 + extras.length);
  const storyKey = parseSeriesKey(state.story);
  const [extrasOpen, setExtrasOpen] = useState(!!(state.bookMessage || state.memoryPhotoPath));
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoView, setPhotoView] = useState<string | null>(null);

  // 思い出の写真は選んだらすぐ送って、保存先を覚えておく（印刷するので長い辺 2400px に縮める）
  async function pickMemoryPhoto(file: File | undefined) {
    if (!file || !state.draftId) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const small = await shrinkPhoto(await toViewablePhoto(file), 2400);
      const form = new FormData();
      form.set("photo", small);
      const res = await fetch(`/api/drafts/${encodeURIComponent(state.draftId)}/memory-photo`, { method: "POST", body: form });
      const json = await res.json();
      if (json.needLogin) {
        router.push(`/login?next=${encodeURIComponent("/create/checkout")}`);
        return;
      }
      if (!res.ok || !json.path) throw new Error(json.error ?? "写真を送れませんでした");
      update({ memoryPhotoPath: json.path });
      setPhotoView(URL.createObjectURL(small));
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "写真を送れませんでした");
    } finally {
      setPhotoBusy(false);
    }
  }

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
          extraEpisodes: extras,
          extraDrafts: state.extraDrafts,
          coupon: coupon?.code ?? "",
          childBirthday: state.childBirthday,
          childHonorific: state.childHonorific,
          bookMessage: state.bookMessage,
          memoryPhotoPath: state.memoryPhotoPath,
          deliveryDate: state.deliveryDate,
        }),
      });
      const json = await res.json();
      if (json.needLogin) {
        router.push(`/login?next=${encodeURIComponent("/create/checkout")}`);
        return;
      }
      if (!res.ok || !json.url) throw new Error(json.error ?? "決済画面を開けませんでした");
      window.location.assign(json.url);
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
          <div className="sum-row"><span>お話</span><span>{storyLabel(state.story)}</span></div>
          {storyKey &&
            extras.map((no) => (
              <div key={no} className="sum-row"><span>まとめて</span><span>{storyLabel(seriesKey(storyKey.series, no, storyKey.level))}</span></div>
            ))}
          {levelLabel(state.story) && <div className="sum-row"><span>文の量</span><span>{levelLabel(state.story)}</span></div>}
          <div className="sum-row"><span>テイスト</span><span>{getTaste(state.taste)?.name}</span></div>
          <div className="sum-row"><span>主人公</span><span>{state.childName}{state.childAge ? `（${state.childAge}さい）` : ""}</span></div>
          {state.childBirthday && <div className="sum-row"><span>お誕生日</span><span>{state.childBirthday.replaceAll("-", "/")}</span></div>}
          <div className="sum-row"><span>絵本の種類</span><span>{size.name}（{size.spec}）</span></div>
          <div className="divider" />
          <div className="sum-row"><span>絵本</span><span>{yen(size.price)}</span></div>
          {coupon && <div className="sum-row" style={{ color: "var(--coral)" }}><span>クーポン（{coupon.label}）</span><span>−{yen(size.price - firstPrice)}</span></div>}
          {books > 1 && <div className="sum-row"><span>追加の{books - 1}冊{extras.length > 0 ? `（${1 + extras.length}話×${state.copies}冊）` : ""}</span><span>{yen(extraCopyPrice(state.size) * (books - 1))}</span></div>}
          <div className="sum-row"><span>送料</span><span>0円</span></div>
          <div className="sum-total">
            <span className="display" style={{ fontSize: 15, fontWeight: 800 }}>合計（税込）</span>
            <span className="display" style={{ fontSize: 26, fontWeight: 900, color: "var(--coral)" }}>{yen(orderTotal(state.size, state.copies, firstPrice, 1 + extras.length))}</span>
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
          {coupon && books > 1 && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--sub)" }}>クーポンは1冊目に使えます。追加の冊数は通常の値段です。</p>
          )}
        </div>
        <div className="card" style={{ padding: 18, gap: 12 }}>
          <button
            type="button"
            aria-expanded={extrasOpen}
            onClick={() => setExtrasOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 0, border: 0, background: "none", cursor: "pointer", textAlign: "left" }}
          >
            <span className="display" style={{ fontSize: 15, fontWeight: 800, color: "var(--navy)" }}>絵本に入れるおまけ（任意）</span>
            <span aria-hidden="true" style={{ fontSize: 13, fontWeight: 700, color: "var(--coral)", flexShrink: 0 }}>{extrasOpen ? "閉じる ▲" : "開く ▼"}</span>
          </button>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
            おうちの方からのメッセージと、思い出の写真を1枚、絵本の最後の方のページに入れられます。入れないときは、そのページはおえかきページになります。
          </p>
          {extrasOpen && (
            <>
              <div className="field">
                <label htmlFor="bookmessage" style={{ fontSize: 14, fontWeight: 800, color: "var(--navy)" }}>
                  おうちの方からのメッセージ（{BOOK_MESSAGE_MAX}文字まで）
                </label>
                <textarea
                  id="bookmessage"
                  rows={4}
                  maxLength={BOOK_MESSAGE_MAX}
                  placeholder="例：うまれてきてくれて ありがとう。だいすきだよ。"
                  value={state.bookMessage}
                  onChange={(e) => update({ bookMessage: e.target.value })}
                />
                <p style={{ margin: 0, fontSize: 12, color: "var(--sub)", textAlign: "right" }}>
                  {state.bookMessage.length}/{BOOK_MESSAGE_MAX}
                </p>
              </div>
              <div className="field">
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--navy)" }}>思い出の写真（1枚）</div>
                {state.memoryPhotoPath ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {photoView && (
                      // eslint-disable-next-line @next/next/no-img-element -- 選んだ写真のその場の表示
                      <img src={photoView} alt="選んだ思い出の写真" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10 }} />
                    )}
                    <span style={{ fontSize: 14 }}>写真を入れます</span>
                    <button
                      type="button"
                      className="ghost"
                      style={{ height: 36, padding: "0 14px", fontSize: 13, marginLeft: "auto" }}
                      onClick={() => {
                        update({ memoryPhotoPath: "" });
                        setPhotoView(null);
                      }}
                    >
                      取り消す
                    </button>
                  </div>
                ) : (
                  <label className="ghost" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 44, padding: "0 18px", alignSelf: "flex-start", cursor: "pointer" }}>
                    {photoBusy ? "写真を送っています…" : "写真を選ぶ"}
                    <input
                      type="file"
                      accept="image/*,.heic,.heif"
                      hidden
                      disabled={photoBusy}
                      onChange={(e) => {
                        pickMemoryPhoto(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                {photoError && <p className="error" role="alert">{photoError}</p>}
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
                  写真は1ページにそのまま印刷します（絵にはしません）。印刷のためだけに使い、お支払いから100日で削除します。
                </p>
              </div>
            </>
          )}
        </div>
        <div className="card" style={{ padding: 18, gap: 12 }}>
          <div className="display" style={{ fontSize: 15, fontWeight: 800, color: "var(--navy)" }}>お届け日</div>
          <div className="field">
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--navy)" }}>お届け希望日（この日までにお届け）</div>
            <DatePicker value={state.deliveryDate} min={minDate} max={maxDate} onChange={(d) => update({ deliveryDate: d })} />
            {state.deliveryDate && (
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>{dateLabel(state.deliveryDate)}までにお届け</p>
            )}
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
              ご注文日から{DELIVERY_MIN_DAYS}日後以降（色の付いた日）を選べます。選んだ日までに届くように発送します。日付を選ばないときは、できあがり次第お届けします（{dateLabel(minDate)}ごろまでにお届け予定）。印刷・製本を外部の製本会社に依頼しているため、時間帯は指定できません。
            </p>
            {state.deliveryDate && (
              <button type="button" className="ghost" style={{ alignSelf: "flex-start", height: 36, padding: "0 14px", fontSize: 13 }} onClick={() => update({ deliveryDate: "" })}>
                日付の指定をやめる
              </button>
            )}
            {!dateOk && <p className="error" role="alert">{DELIVERY_MIN_DAYS}日後から{DELIVERY_MAX_DAYS}日後までの日付を選んでください</p>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--sub)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <span>カード・Apple Pay・Google Pay・コンビニ払い・PayPay に対応。決済サービス（Stripe）の安全な画面で入力します</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--navy)", background: "var(--cream)", border: "1px solid var(--coral)", borderRadius: 12, padding: "10px 14px" }}>
          <strong>Apple Pay・Google Pay の方へ：</strong>Apple Pay・Google Pay に登録済みの住所にお届けします。支払う前に、表示される「配送先」の住所をご確認ください。
        </p>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: "var(--sub)" }}>
          コンビニ払いは、お支払い番号が表示された画面で手続き完了です（このサイトには戻りません）。お支払い番号と手順はメールでもお送りし、マイページからも開けます。
        </p>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: "var(--sub)" }}>
          ご注文前に<a href="/legal" target="_blank">特定商取引法に基づく表記</a>・<a href="/terms" target="_blank">利用規約</a>・<a href="/privacy" target="_blank">プライバシーポリシー</a>をご確認ください。お支払いに進むと、利用規約に同意したものとします。
        </p>
        {error && <p className="error" role="alert">{error}</p>}
      </main>
      <NextButton onClick={pay} disabled={sending || photoBusy || !state.draftId || !dateOk}>
        {sending ? "決済画面を開いています…" : "お届け先とお支払いへ"}
      </NextButton>
    </>
  );
}
