"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ANON_TRIAL_IMAGES, MEMBER_MONTHLY_PREVIEWS, RETENTION } from "@/lib/catalog";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { useFlow } from "../flow";
import { FacePicker } from "../face-picker";
import { loginHref, useAccount } from "../account";
import { NextButton, StepHeader, StepTitle } from "../step";

const ACCEPT = "image/jpeg,image/png,image/webp";

type Saved = { id: string; url: string };

function PhotoSlot({
  id,
  title,
  note,
  required,
  file,
  onChange,
  saved,
  savedId,
  onPickSaved,
}: {
  id: string;
  title: string;
  note: string;
  required: boolean;
  file: File | null;
  onChange: (f: File | null) => void;
  saved: Saved[];
  savedId: string | null;
  onPickSaved: (id: string | null) => void;
}) {
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);
  const url = fileUrl ?? saved.find((p) => p.id === savedId)?.url ?? null;
  // 選んだばかりの写真（顔を囲んで選ぶ前）
  const [picking, setPicking] = useState<File | null>(null);

  return (
    <div className="card">
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div className="display" style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>{title}</div>
        <div
          style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: required ? "#FBE3E0" : "#ECE8E1", color: required ? "#A3261A" : "var(--sub)" }}
        >
          {required ? "必須" : "任意"}
        </div>
      </div>
      <label
        htmlFor={id}
        style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", justifyContent: "center", height: url ? 220 : 160, borderRadius: 14, border: "2px dashed #B9C8E2", background: "#F3F6FB", color: "var(--blue)", fontSize: 14, cursor: "pointer", overflow: "hidden" }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- 選んだ写真のその場プレビュー
          <img src={url} alt={`${title}の写真`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (
          <>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            <span>写真をアップロード</span>
          </>
        )}
      </label>
      <input
        id={id}
        type="file"
        accept={ACCEPT}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setPicking(f);
          e.target.value = "";
        }}
      />
      {picking && (
        <FacePicker
          file={picking}
          title={title.replace(/（.*）/, "")}
          onDone={(cropped) => {
            setPicking(null);
            onChange(cropped);
          }}
          onCancel={() => setPicking(null)}
        />
      )}
      <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>{note}</div>
      {saved.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)" }}>保存している写真から選ぶ</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {saved.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={savedId === p.id && !file}
                aria-label="保存している写真"
                onClick={() => onPickSaved(p.id)}
                style={{ flexShrink: 0, width: 64, height: 64, padding: 0, borderRadius: 12, overflow: "hidden", cursor: "pointer", border: savedId === p.id && !file ? "3px solid var(--coral)" : "1px solid var(--line)", background: "#fff" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 署名付きURLの一時画像 */}
                <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </button>
            ))}
          </div>
        </div>
      )}
      {(file || savedId) && !required && (
        <button type="button" className="ghost" style={{ height: 40, alignSelf: "flex-start" }} onClick={() => { onChange(null); onPickSaved(null); }}>
          写真をはずす
        </button>
      )}
    </div>
  );
}

export default function PhotoPage() {
  const router = useRouter();
  const { state, update, photos, setPhotos } = useFlow();
  const [account] = useAccount();
  const [saved, setSaved] = useState<Saved[]>([]);
  const [savedIds, setSavedIds] = useState<{ child: string | null; mom: string | null; dad: string | null }>({ child: null, mom: null, dad: null });
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const member = !!account?.loggedIn;

  useEffect(() => {
    if (!member) return;
    fetch("/api/account/photos")
      .then((r) => r.json())
      .then((j) => setSaved(j.photos ?? []))
      .catch(() => {});
  }, [member]);

  const pickedChild = !!photos.child || !!savedIds.child;
  const newUpload = !!photos.child || !!photos.mom || !!photos.dad;
  // 写真が選び直されていなければ、前回作った下書きをそのまま使う
  const reuse = !!state.draftId && !pickedChild;
  const canSubmit = reuse || (pickedChild && (!newUpload || consent));

  async function submit() {
    if (reuse) return router.push("/create/preview");
    if (!pickedChild) return;
    setSending(true);
    setError(null);
    setNeedLogin(false);
    const form = new FormData();
    form.set("taste", state.taste);
    form.set("story", state.story);
    form.set("childName", state.childName);
    if (state.childAge) form.set("childAge", String(state.childAge));
    form.set("consent", String(consent));
    try {
      if (photos.child) form.set("childPhoto", await shrinkPhoto(photos.child));
      else if (savedIds.child) form.set("childPhotoId", savedIds.child);
      if (photos.mom) form.set("momPhoto", await shrinkPhoto(photos.mom));
      else if (savedIds.mom) form.set("momPhotoId", savedIds.mom);
      if (photos.dad) form.set("dadPhoto", await shrinkPhoto(photos.dad));
      else if (savedIds.dad) form.set("dadPhotoId", savedIds.dad);
      const res = await fetch("/api/drafts", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setNeedLogin(!!json.needLogin);
        throw new Error(json.error ?? "送信に失敗しました");
      }
      update({ draftId: json.draftId, demo: !!json.demo, previews: {} });
      setPhotos({ child: null, mom: null, dad: null });
      setSavedIds({ child: null, mom: null, dad: null });
      router.push("/create/preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました");
      setSending(false);
    }
  }

  return (
    <>
      <StepHeader step={3} back="/create/story" />
      <main className="step-body">
        <StepTitle title="登場人物の写真をえらんでください" lead="正面を向いた、明るい写真がおすすめです。" />
        {account?.configured && !account.loggedIn && (
          <div className="demo-note" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>会員登録なしでも、1回だけ見本{ANON_TRIAL_IMAGES}枚をお試しできます。</span>
            <span>
              <Link href={loginHref("/create/photo")}>無料会員登録</Link>
              すると、月{MEMBER_MONTHLY_PREVIEWS}枚まで作り直しができ、写真も保存できます。
            </span>
          </div>
        )}
        <PhotoSlot
          id="child-photo"
          title="主人公（お子さま）"
          note="顔がはっきり写った写真を1枚えらんでください。"
          required
          file={photos.child}
          onChange={(f) => { setPhotos({ ...photos, child: f }); if (f) setSavedIds((s) => ({ ...s, child: null })); }}
          saved={saved}
          savedId={savedIds.child}
          onPickSaved={(id) => { setSavedIds((s) => ({ ...s, child: id })); if (id) setPhotos({ ...photos, child: null }); }}
        />
        <PhotoSlot
          id="mom-photo"
          title="ママ"
          note="ママを登場させたい場合にえらんでください。"
          required={false}
          file={photos.mom}
          onChange={(f) => { setPhotos({ ...photos, mom: f }); if (f) setSavedIds((s) => ({ ...s, mom: null })); }}
          saved={saved}
          savedId={savedIds.mom}
          onPickSaved={(id) => { setSavedIds((s) => ({ ...s, mom: id })); if (id) setPhotos({ ...photos, mom: null }); }}
        />
        <PhotoSlot
          id="dad-photo"
          title="パパ"
          note="パパを登場させたい場合にえらんでください。"
          required={false}
          file={photos.dad}
          onChange={(f) => { setPhotos({ ...photos, dad: f }); if (f) setSavedIds((s) => ({ ...s, dad: null })); }}
          saved={saved}
          savedId={savedIds.dad}
          onPickSaved={(id) => { setSavedIds((s) => ({ ...s, dad: id })); if (id) setPhotos({ ...photos, dad: null }); }}
        />
        {reuse ? (
          <p className="demo-note">写真は受け取り済みです。選び直す場合は、もう一度写真をえらんでください。</p>
        ) : newUpload ? (
          <div className="card consent">
            <input id="agree" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <label htmlFor="agree">
              {member
                ? `写真は絵本の制作にだけ使います。写真は保存され、マイページからいつでも削除できます（最後に使ってから${RETENTION.photoIdleDays === 365 ? "1年" : `${RETENTION.photoIdleDays}日`}で自動削除）。`
                : `写真は絵本の制作にだけ使います。会員登録されない場合、写真は${RETENTION.anonPhotoDays}日後に自動で削除します。`}
              これに同意します。（<a href="/privacy" target="_blank">写真の取り扱いについて</a>）
            </label>
          </div>
        ) : null}
        {error && <p className="error" role="alert">{error}</p>}
        {needLogin && (
          <Link href={loginHref("/create/photo")} className="ghost">無料会員登録・ログインへ</Link>
        )}
      </main>
      <NextButton onClick={submit} disabled={!canSubmit || sending}>
        {sending ? "送信中…" : "絵本をつくる"}
      </NextButton>
    </>
  );
}
