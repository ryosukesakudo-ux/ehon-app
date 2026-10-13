"use client";

import { useEffect, useMemo, useState } from "react";
import { RETENTION } from "@/lib/catalog";
import { toViewablePhoto } from "@/lib/heic-photo";
import { FacePhoto } from "@/components/face-photo";
import type { Face } from "@/lib/face";
import { FacePicker } from "./face-picker";

// プレビューの登場人物の確認で、1人だけ写真を変えて作り直す（2026-10-13 作道さん）。
// 新しい写真（顔を囲んで選ぶ）か、会員の保存している写真から選ぶ。

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

export type Saved = { id: string; url: string; face?: Face | null };
export type PhotoChoice = { file: File; face: Face | null } | { savedId: string };

export function PhotoSwap({
  name,
  saved,
  disabled,
  label,
  onSubmit,
}: {
  /** 誰の写真か（例：ママ） */
  name: string;
  saved: Saved[];
  disabled: boolean;
  /** 作り直すボタンの文言（プレビューの枚数・チャージの金額を含む） */
  label: string;
  /** うまくいったら true（選んだ写真を空にする） */
  onSubmit: (choice: PhotoChoice) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<File | null>(null);
  const [picked, setPicked] = useState<{ file: File; face: Face | null } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileUrl = useMemo(() => (picked ? URL.createObjectURL(picked.file) : null), [picked]);
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);
  const savedPhoto = saved.find((p) => p.id === savedId);
  const ready = picked ? consent : !!savedPhoto;

  async function pick(f: File) {
    setLoadError(null);
    setLoading(true);
    try {
      setPicking(await toViewablePhoto(f));
    } catch (e) {
      console.error("photo convert failed", e);
      setLoadError("この写真は読み込めませんでした。別の写真（JPEG・PNG）をお試しください");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    const choice: PhotoChoice | null = picked ?? (savedId ? { savedId } : null);
    if (!choice) return;
    if (await onSubmit(choice)) {
      setPicked(null);
      setSavedId(null);
      setConsent(false);
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="ghost" disabled={disabled} onClick={() => setOpen(true)}>
        {name}の写真を変えて作り直す
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
      <div className="display" style={{ fontSize: 15, fontWeight: 800, color: "var(--navy)" }}>{name}の写真を変える</div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>新しい写真から{name}だけ描き直します。ほかの人のキャラクターはそのままです。</div>
      <label
        htmlFor={`swap-${name}`}
        style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", justifyContent: "center", height: fileUrl || savedPhoto ? 200 : 110, borderRadius: 14, border: "2px dashed #B9C8E2", background: "#F3F6FB", color: "var(--blue)", fontSize: 14, cursor: "pointer", overflow: "hidden" }}
      >
        {fileUrl ? (
          <FacePhoto src={fileUrl} alt={`${name}の新しい写真`} face={picked?.face ?? null} />
        ) : savedPhoto ? (
          <FacePhoto src={savedPhoto.url} alt={`${name}の新しい写真`} face={savedPhoto.face ?? null} />
        ) : (
          <span>{loading ? "写真を読み込んでいます…" : "写真をアップロード"}</span>
        )}
      </label>
      <input
        id={`swap-${name}`}
        type="file"
        accept={ACCEPT}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
          e.target.value = "";
        }}
      />
      {picking && (
        <FacePicker
          file={picking}
          title={name}
          onDone={(cropped, face) => {
            setPicking(null);
            setPicked({ file: cropped, face });
            setSavedId(null);
          }}
          onCancel={() => setPicking(null)}
          onError={() => {
            setPicking(null);
            setLoadError("この写真は読み込めませんでした。別の写真（JPEG・PNG）をお試しください");
          }}
        />
      )}
      {loadError && <p className="error" role="alert" style={{ margin: 0 }}>{loadError}</p>}
      {saved.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)" }}>保存している写真から選ぶ</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {saved.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={savedId === p.id && !picked}
                aria-label="保存している写真"
                onClick={() => { setSavedId(p.id); setPicked(null); }}
                style={{ flexShrink: 0, width: 64, height: 64, padding: 0, borderRadius: 12, overflow: "hidden", cursor: "pointer", border: savedId === p.id && !picked ? "3px solid var(--coral)" : "1px solid var(--line)", background: "#fff" }}
              >
                <FacePhoto src={p.url} alt="" face={p.face} fit="cover" />
              </button>
            ))}
          </div>
        </div>
      )}
      {picked && (
        <div className="card consent">
          <input id={`swap-agree-${name}`} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <label htmlFor={`swap-agree-${name}`}>
            写真は絵本の制作にだけ使います。写真は保存され、マイページからいつでも削除できます（最後に使ってから{RETENTION.photoIdleDays === 365 ? "1年" : `${RETENTION.photoIdleDays}日`}で自動削除）。これに同意します。（<a href="/privacy" target="_blank">写真の取り扱いについて</a>）
          </label>
        </div>
      )}
      <button type="button" className="ghost" disabled={disabled || !ready} onClick={submit}>{label}</button>
      <button type="button" className="ghost" style={{ height: 40, alignSelf: "flex-start" }} onClick={() => { setOpen(false); setPicked(null); setSavedId(null); }}>
        やめる
      </button>
    </div>
  );
}
