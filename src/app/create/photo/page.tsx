"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFlow } from "../flow";
import { NextButton, StepHeader, StepTitle } from "../step";

const ACCEPT = "image/jpeg,image/png,image/webp";

// スマホの写真は大きいので、送る前に縮小する（サーバーの受け取り上限は約4.5MB）
async function shrink(file: File, maxEdge = 1600): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  if (!blob) throw new Error("写真を読み込めませんでした。別の写真をお試しください");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

function PhotoSlot({
  id,
  title,
  note,
  required,
  file,
  onChange,
}: {
  id: string;
  title: string;
  note: string;
  required: boolean;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

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
        style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", justifyContent: "center", height: 160, borderRadius: 14, border: "2px dashed #B9C8E2", background: "#F3F6FB", color: "var(--blue)", fontSize: 14, cursor: "pointer", overflow: "hidden" }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- 選んだ写真のその場プレビュー
          <img src={url} alt={`${title}の写真`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>{note}</div>
      {file && !required && (
        <button type="button" className="ghost" style={{ height: 40, alignSelf: "flex-start" }} onClick={() => onChange(null)}>
          写真をはずす
        </button>
      )}
    </div>
  );
}

export default function PhotoPage() {
  const router = useRouter();
  const { state, update, photos, setPhotos } = useFlow();
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 写真が選び直されていなければ、前回作った下書きをそのまま使う
  const reuse = !!state.draftId && !photos.child;
  const canSubmit = reuse || (!!photos.child && consent);

  async function submit() {
    if (reuse) return router.push("/create/preview");
    if (!photos.child) return;
    setSending(true);
    setError(null);
    const form = new FormData();
    form.set("taste", state.taste);
    form.set("story", state.story);
    form.set("childName", state.childName);
    form.set("consent", String(consent));
    try {
      form.set("childPhoto", await shrink(photos.child));
      if (photos.mom) form.set("momPhoto", await shrink(photos.mom));
      const res = await fetch("/api/drafts", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "送信に失敗しました");
      update({ draftId: json.draftId, demo: !!json.demo, previews: {} });
      setPhotos({ child: null, mom: null });
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
        <PhotoSlot
          id="child-photo"
          title="主人公（お子さま）"
          note="顔がはっきり写った写真を1枚えらんでください。"
          required
          file={photos.child}
          onChange={(f) => setPhotos({ ...photos, child: f })}
        />
        <PhotoSlot
          id="mom-photo"
          title="ママ"
          note="ママを登場させたい場合にえらんでください。"
          required={false}
          file={photos.mom}
          onChange={(f) => setPhotos({ ...photos, mom: f })}
        />
        {reuse ? (
          <p className="demo-note">写真は受け取り済みです。選び直す場合は、もう一度写真をえらんでください。</p>
        ) : (
          <div className="card consent">
            <input id="agree" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <label htmlFor="agree">
              写真は絵本の制作にだけ使い、完成後に自動で削除されることに同意します。（
              <a href="/privacy" target="_blank">写真の取り扱いについて</a>）
            </label>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </main>
      <NextButton onClick={submit} disabled={!canSubmit || sending}>
        {sending ? "送信中…" : "絵本をつくる"}
      </NextButton>
    </>
  );
}
