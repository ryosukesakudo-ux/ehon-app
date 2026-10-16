"use client";

import { useState } from "react";
import Link from "next/link";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { toViewablePhoto } from "@/lib/heic-photo";

const NICKNAME_MAX = 20;
const BODY_MIN = 10;
const BODY_MAX = 800;

export function ReviewForm({ orderId }: { orderId: string }) {
  const [nickname, setNickname] = useState("");
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoView, setPhotoView] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ coupon: string; discount: number } | null>(null);

  const ready = nickname.trim() && rating > 0 && body.trim().length >= BODY_MIN && (!photo || consent);

  async function pick(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    setError(null);
    try {
      const small = await shrinkPhoto(await toViewablePhoto(file), 1600);
      setPhoto(small);
      setPhotoView(URL.createObjectURL(small));
    } catch (e) {
      setError(e instanceof Error ? e.message : "写真を読み込めませんでした");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("order", orderId);
      form.set("nickname", nickname.trim());
      form.set("rating", String(rating));
      form.set("body", body.trim());
      if (photo) {
        form.set("photo", photo);
        form.set("consent", consent ? "1" : "0");
      }
      const res = await fetch("/api/reviews", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "投稿できませんでした");
      setDone({ coupon: json.coupon, discount: json.discount });
    } catch (e) {
      setError(e instanceof Error ? e.message : "投稿できませんでした");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="card" style={{ gap: 12, border: "2px solid var(--coral)", textAlign: "center" }}>
        <div className="display" style={{ fontSize: 18, fontWeight: 800, color: "var(--navy)" }}>ありがとうございました！</div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8 }}>
          レビューを公開しました。お礼のクーポンです（{done.discount.toLocaleString()}円引き・1回だけ）。
        </p>
        <div className="display" style={{ fontSize: 24, fontWeight: 900, letterSpacing: 1, color: "var(--coral)" }}>{done.coupon}</div>
        <p style={{ margin: 0, fontSize: 12, color: "var(--sub)" }}>次のご注文の確認画面で入力してください。同じ内容をメールでもお送りしました。</p>
        <Link href="/reviews" className="ghost">みんなのレビューを見る</Link>
      </section>
    );
  }

  return (
    <section className="card" style={{ gap: 16 }}>
      <div className="field">
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--navy)" }}>満足度</div>
        <div role="radiogroup" aria-label="満足度" style={{ display: "flex", gap: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`星${n}つ`}
              onClick={() => setRating(n)}
              style={{ background: "none", border: "none", padding: 2, fontSize: 34, lineHeight: 1, cursor: "pointer", color: n <= rating ? "#F6C445" : "#d9cfbd" }}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="review-nickname">お名前（ニックネーム）</label>
        <input id="review-nickname" type="text" maxLength={NICKNAME_MAX} placeholder="例：ゆいママ" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        <p style={{ margin: 0, fontSize: 12, color: "var(--sub)" }}>サイトにはこのお名前で載ります。本名でなくてかまいません。</p>
      </div>
      <div className="field">
        <label htmlFor="review-body">ご感想（{BODY_MIN}〜{BODY_MAX}文字）</label>
        <textarea
          id="review-body"
          rows={6}
          maxLength={BODY_MAX}
          placeholder="例：自分が出てくる絵本に、娘が大喜びで毎晩読んでとせがまれます。"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <p style={{ margin: 0, fontSize: 12, color: "var(--sub)", textAlign: "right" }}>{body.length}/{BODY_MAX}</p>
      </div>
      <div className="field">
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--navy)" }}>写真（任意・1枚）</div>
        {photo ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {photoView && (
              // eslint-disable-next-line @next/next/no-img-element -- 選んだ写真のその場の表示
              <img src={photoView} alt="選んだ写真" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10 }} />
            )}
            <button
              type="button"
              className="ghost"
              style={{ height: 36, padding: "0 14px", fontSize: 13, marginLeft: "auto" }}
              onClick={() => {
                setPhoto(null);
                setPhotoView(null);
                setConsent(false);
              }}
            >
              取り消す
            </button>
          </div>
        ) : (
          <label className="ghost" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 44, padding: "0 18px", alignSelf: "flex-start", cursor: "pointer" }}>
            {photoBusy ? "読み込んでいます…" : "写真を選ぶ"}
            <input
              type="file"
              accept="image/*,.heic,.heif"
              hidden
              disabled={photoBusy}
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        )}
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>届いた絵本や、読んでいるところの写真などを載せられます。</p>
        {photo && (
          <label className="consent" style={{ padding: 12, borderRadius: 12, background: "#FFF6E0" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              <b>この写真がサイトで一般公開され、誰でも見られることに同意します。</b>
              お子さまのお顔やお名前が写っている場合も、そのまま公開されます。
            </span>
          </label>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="cta" disabled={!ready || busy || photoBusy} onClick={submit}>
        {busy ? "送っています…" : "レビューを投稿する"}
      </button>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
        投稿するとすぐサイトに公開されます。内容によっては、運営の判断で非表示にすることがあります。
      </p>
    </section>
  );
}
