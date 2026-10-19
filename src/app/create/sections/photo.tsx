"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MEMBER_MONTHLY_PREVIEWS, RETENTION, getTaste, type Person } from "@/lib/catalog";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { toViewablePhoto } from "@/lib/heic-photo";
import { Lottie } from "@/components/lottie";
import { FacePhoto } from "@/components/face-photo";
import { faceToField, type Face } from "@/lib/face";
import { useFlow } from "../flow";
import { castLabel, parseCustomKey } from "@/lib/custom-story";
import { FacePicker } from "../face-picker";
import { DrawingWait } from "../drawing-wait";
import { loginHref, useAccount } from "../account";
import { NextButton } from "../step";
import { SiblingFields, siblingComplete } from "../sibling-fields";
import { parseSeriesKey } from "@/lib/story-key";

// HEIC（iPhoneの写真）も選べるようにして、選んだあと JPEG に変換する
const MAX_SIBLINGS = 2;

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

type Saved = { id: string; url: string; face?: Face | null };
type SavedCharacter = Saved & { person: Person; taste: string; childName: string | null };

function PhotoSlot({
  id,
  title,
  note,
  required,
  file,
  face,
  onChange,
  saved,
  savedId,
  onPickSaved,
  characters,
  characterId,
  onPickCharacter,
  taste,
  head,
}: {
  id: string;
  title: string;
  /** 見出しのすぐ下に出すもの（ママ・パパの欄の「兄弟姉妹を入れる」） */
  head?: ReactNode;
  note: string;
  required: boolean;
  file: File | null;
  /** 新しく選んだ写真で、顔を囲んだ位置 */
  face: Face | null;
  onChange: (f: File | null, face?: Face | null) => void;
  saved: Saved[];
  savedId: string | null;
  onPickSaved: (id: string | null) => void;
  characters: SavedCharacter[];
  characterId: string | null;
  onPickCharacter: (id: string | null) => void;
  /** 今回のテイスト（保存しているキャラクターと同じなら、描き直さずにそのまま使う） */
  taste?: string;
}) {
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);
  const savedPhoto = saved.find((p) => p.id === savedId);
  const url = fileUrl ?? savedPhoto?.url ?? characters.find((c) => c.id === characterId)?.url ?? null;
  // 囲んだ顔の位置（キャラクターの絵には無い）
  const shownFace = fileUrl ? face : savedPhoto && !characterId ? savedPhoto.face : null;
  // 選んだばかりの写真（顔を囲んで選ぶ前）
  const [picking, setPicking] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
      {head}
      <label
        htmlFor={id}
        style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", justifyContent: "center", height: url ? 220 : 160, borderRadius: 14, border: "2px dashed #B9C8E2", background: "#F3F6FB", color: "var(--blue)", fontSize: 14, cursor: "pointer", overflow: "hidden", position: "relative" }}
      >
        {url ? (
          <>
            <FacePhoto src={url} alt={`${title}の写真`} face={shownFace} />
            <Lottie key={url} name="check" loop={false} style={{ position: "absolute", right: 6, top: 6, width: 48, height: 48 }} />
          </>
        ) : (
          <>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            <span>{loading ? "写真を読み込んでいます…" : "写真をアップロード"}</span>
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
          if (f) pick(f);
          e.target.value = "";
        }}
      />
      {picking && (
        <FacePicker
          file={picking}
          title={title.replace(/（.*）/, "")}
          onDone={(cropped, f) => {
            setPicking(null);
            onChange(cropped, f);
          }}
          onCancel={() => setPicking(null)}
          onError={() => {
            setPicking(null);
            setLoadError("この写真は読み込めませんでした。別の写真（JPEG・PNG）をお試しください");
          }}
        />
      )}
      {loadError && <p className="error" role="alert" style={{ margin: 0 }}>{loadError}</p>}
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
                <FacePhoto src={p.url} alt="" face={p.face} fit="cover" />
              </button>
            ))}
          </div>
        </div>
      )}
      {characters.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)" }}>前に作ったキャラクターから選ぶ</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {characters.map((c) => {
              const same = c.taste === taste;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={characterId === c.id && !file}
                  aria-label={`前に作ったキャラクター（${getTaste(c.taste)?.name ?? ""}${same ? "・プレビュー消費なし" : "・描き直しでプレビュー1枚"}）`}
                  onClick={() => onPickCharacter(c.id)}
                  style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "stretch", width: 72, padding: 0, borderRadius: 12, overflow: "hidden", cursor: "pointer", border: characterId === c.id && !file ? "3px solid var(--coral)" : "1px solid var(--line)", background: "#fff" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- 署名付きURLの一時画像 */}
                  <img src={c.url} alt="" style={{ width: "100%", height: 64, objectFit: "cover" }} />
                  {/* どのテイストで作ったか（今回と同じなら無料、違えば描き直し） */}
                  <span style={{ fontSize: 10, lineHeight: 1.5, padding: "1px 2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", background: same ? "#E3F4E8" : "#ECE8E1", color: same ? "#1E6B3A" : "var(--sub)", fontWeight: 700 }}>
                    {getTaste(c.taste)?.name ?? "不明"}
                  </span>
                </button>
              );
            })}
          </div>
          {(() => {
            const picked = !file ? characters.find((c) => c.id === characterId) : undefined;
            const now = getTaste(taste ?? "")?.name ?? "";
            if (!picked) {
              return (
                <div style={{ fontSize: 11, lineHeight: 1.6, color: "var(--sub)" }}>
                  今回と同じテイスト（{now}）のキャラクターは、そのまま使います（プレビューの枚数を使いません）。違うテイストのものは、その絵をもとに{now}で描き直します（プレビュー1枚）。
                </div>
              );
            }
            return picked.taste === taste ? (
              <p className="info-note" style={{ margin: 0, fontSize: 12 }}>
                {now}で作ったキャラクターなので、そのまま使います。プレビューの枚数は使いません。
              </p>
            ) : (
              <p className="info-note" style={{ margin: 0, fontSize: 12 }}>
                {getTaste(picked.taste)?.name ?? "別のテイスト"}で作ったキャラクターです。今回は{now}なので、この絵をもとに描き直します（プレビュー1枚）。
              </p>
            );
          })()}
        </div>
      )}
      {(file || savedId || characterId) && !required && (
        <button type="button" className="ghost" style={{ height: 40, alignSelf: "flex-start" }} onClick={() => { onChange(null); onPickSaved(null); onPickCharacter(null); }}>
          写真をはずす
        </button>
      )}
    </div>
  );
}

/** 写真えらび（この作成ページの最後の項目。下の「絵本をつくる」で写真を送り、見本へ進む） */
export function PhotoSection() {
  const router = useRouter();
  const { state, update, photos, setPhotos } = useFlow();
  const [account] = useAccount();
  const [saved, setSaved] = useState<Saved[]>([]);
  const [savedIds, setSavedIds] = useState<{ child: string | null; mom: string | null; dad: string | null }>({ child: null, mom: null, dad: null });
  const [characters, setCharacters] = useState<SavedCharacter[]>([]);
  const [characterIds, setCharacterIds] = useState<Record<Person, string | null>>({ child: null, mom: null, dad: null });
  // オリジナルのお話の、ほかの登場人物（ペットなど）
  const cast = parseCustomKey(state.story)?.cast ?? [];
  // 台本のお話に足す兄弟姉妹（会員だけ・最大2人。写真はほかの登場人物と同じ欄 photos.guests に入れる）
  const series = !!parseSeriesKey(state.story);
  const sibs = series && account?.loggedIn ? state.siblings : [];
  const slots = cast.length ? cast.length : sibs.length;
  const each = <T,>(f: (j: number) => T) => Array.from({ length: slots }, (_, j) => f(j));
  const [guestSavedIds, setGuestSavedIds] = useState<(string | null)[]>([]);
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
    fetch("/api/account/characters")
      .then((r) => r.json())
      .then((j) => setCharacters(j.characters ?? []))
      .catch(() => {});
  }, [member]);

  const pickedChild = !!photos.child || !!savedIds.child || !!characterIds.child;
  // 兄弟姉妹の人数や呼び方を変えたときは、文の書き直しから作り直す（主人公の写真も選び直してもらう）
  const siblingsJson = JSON.stringify(sibs.filter(siblingComplete));
  const siblingsChanged = !!state.draftId && siblingsJson !== state.siblingsSent;
  const pickedGuest = siblingsChanged || each((i) => !!photos.guests?.[i] || !!guestSavedIds[i]).some(Boolean);
  const newUpload = !!photos.child || !!photos.mom || !!photos.dad || each((i) => !!photos.guests?.[i]).some(Boolean);
  // 写真が選び直されていなければ、前回作った下書きをそのまま使う
  const reuse = !!state.draftId && !pickedChild && !pickedGuest;
  // 兄弟姉妹の欄は、呼び方・年齢・続柄がそろってから
  const canSubmit = sibs.every(siblingComplete) && (reuse || (pickedChild && (!newUpload || consent)));

  // 顔の飾りを消すかどうか。作成済みの下書きがあれば保存し、キャラクターは作り直す（似せ方を変えたときと同じ）
  function changePlainFace(on: boolean) {
    update({ plainFace: on, previews: {} });
    if (state.draftId && !state.demo) {
      fetch(`/api/drafts/${encodeURIComponent(state.draftId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plainFace: on }),
      })
        .then((r) => (r.ok ? null : r.json().then((j) => setError(j.error ?? "保存できませんでした"))))
        .catch(() => setError("保存できませんでした。もう一度お試しください"));
    }
  }

  // 兄弟姉妹を外す（写真の欄も詰める）
  function removeSibling(i: number) {
    update((prev) => ({ siblings: prev.siblings.filter((_, j) => j !== i) }));
    setPhotos({ ...photos, guests: (photos.guests ?? []).filter((_, j) => j !== i) });
    setGuestSavedIds((v) => v.filter((_, j) => j !== i));
  }

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
    form.set("plainFace", String(state.plainFace));
    if (sibs.length) form.set("siblings", siblingsJson);
    // 送れる大きさには上限（約4.5MB）があるので、写真が多いときは少し小さくして送る
    const photoCount = [photos.child, photos.mom, photos.dad, ...each((i) => photos.guests?.[i] ?? null)].filter(Boolean).length;
    const shrink = (f: File) => shrinkPhoto(f, photoCount > 3 ? 1280 : 1600);
    try {
      for (const who of ["child", "mom", "dad"] as const) {
        const face = photos.faces?.[who];
        if (photos[who] && face) form.set(`${who}Face`, faceToField(face));
      }
      if (photos.child) form.set("childPhoto", await shrink(photos.child));
      else if (savedIds.child) form.set("childPhotoId", savedIds.child);
      if (photos.mom) form.set("momPhoto", await shrink(photos.mom));
      else if (savedIds.mom) form.set("momPhotoId", savedIds.mom);
      if (photos.dad) form.set("dadPhoto", await shrink(photos.dad));
      else if (savedIds.dad) form.set("dadPhotoId", savedIds.dad);
      for (let i = 0; i < slots; i++) {
        const f = photos.guests?.[i];
        const face = photos.faces?.[`guest${i}`];
        if (f && face) form.set(`guest${i}Face`, faceToField(face));
        if (f) form.set(`guest${i}Photo`, await shrink(f));
        else if (guestSavedIds[i]) form.set(`guest${i}PhotoId`, guestSavedIds[i]!);
      }
      for (const who of ["child", "mom", "dad"] as const) {
        const id = characterIds[who];
        if (id && !photos[who] && !savedIds[who]) form.set(`${who}CharacterId`, id);
      }
      const res = await fetch("/api/drafts", { method: "POST", body: form });
      // サーバーが時間切れなどで JSON でない返事をしたときも、分かる言葉で知らせる
      const json = await res.json().catch(() => ({ error: res.status === 413 ? "写真が大きすぎて送れませんでした。写真の数を減らすか、別の写真でお試しください" : "混み合っていて送れませんでした。少し時間をおいて、もう一度お試しください" }));
      if (!res.ok) {
        setNeedLogin(!!json.needLogin);
        throw new Error(json.error ?? "送信に失敗しました");
      }
      update({ draftId: json.draftId, demo: !!json.demo, previews: json.previews ?? {}, previewScenes: json.previewScenes ?? [], confirmed: false, pageCount: 0, reused: Object.keys(json.previews ?? {}).map(Number), candidates: {}, picked: {}, likeness: "normal", siblingsSent: siblingsJson });
      setPhotos({ child: null, mom: null, dad: null });
      setSavedIds({ child: null, mom: null, dad: null });
      setGuestSavedIds([]);
      setCharacterIds({ child: null, mom: null, dad: null });
      router.push("/create/preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました");
      setSending(false);
    }
  }

  return (
    <>
      {account?.configured && !account.loggedIn && (
        <div className="demo-note" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>会員登録なしでも、1回だけ表紙と登場人物のキャラクターをお試しで作れます。</span>
          <span>
            <Link href={loginHref("/create/photo")}>無料会員登録</Link>
            すると、毎月{MEMBER_MONTHLY_PREVIEWS}枚まで無料で作り直しができ、写真も保存できます。
          </span>
        </div>
      )}
      <PhotoSlot
        id="child-photo"
        title="主人公（お子さま）"
        note="顔がはっきり写った写真を1枚えらんでください。"
        required
        file={photos.child}
        face={photos.faces?.child ?? null}
        onChange={(f, face) => { setPhotos({ ...photos, child: f, faces: { ...photos.faces, child: face ?? null } }); if (f) { setSavedIds((s) => ({ ...s, child: null })); setCharacterIds((c) => ({ ...c, child: null })); } }}
        saved={saved}
        savedId={savedIds.child}
        onPickSaved={(id) => { setSavedIds((s) => ({ ...s, child: id })); if (id) { setPhotos({ ...photos, child: null }); setCharacterIds((c) => ({ ...c, child: null })); } }}
        characters={characters.filter((c) => c.person === "child")}
        characterId={characterIds.child}
        taste={state.taste}
        onPickCharacter={(id) => { setCharacterIds((c) => ({ ...c, child: id })); if (id) { setPhotos({ ...photos, child: null }); setSavedIds((s) => ({ ...s, child: null })); } }}
      />
      {series && (
        <section className="card" style={{ gap: 8 }}>
          <div className="display" style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>兄弟姉妹もいっしょに</div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
            最大{MAX_SIBLINGS}人まで。12場面すべてで主人公といっしょに冒険するよう、お話の文と絵をAIが書き直します（お話の流れは同じです）。
          </p>
          {member ? (
            sibs.length < MAX_SIBLINGS && (
              <button type="button" className="ghost" onClick={() => update((prev) => ({ siblings: [...prev.siblings, { name: "", age: null, relation: "" }] }))}>
                ＋ 兄弟姉妹を足す（あと{MAX_SIBLINGS - sibs.length}人）
              </button>
            )
          ) : (
            <Link href={loginHref("/create/photo")} className="ghost">兄弟姉妹を足すのは無料会員登録で</Link>
          )}
        </section>
      )}
      {sibs.map((s, i) => (
        <PhotoSlot
          key={`sibling${i}`}
          id={`guest${i}-photo`}
          title={`兄弟姉妹${sibs.length > 1 ? i + 1 : ""}${s.name.trim() ? `（${s.name.trim()}）` : ""}`}
          head={
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <SiblingFields value={s} onChange={(v) => update((prev) => ({ siblings: prev.siblings.map((x, j) => (j === i ? v : x)) }))} />
              <button type="button" className="ghost gray" style={{ alignSelf: "flex-start", height: 36, padding: "0 14px", fontSize: 13 }} onClick={() => removeSibling(i)}>
                この子を外す
              </button>
            </div>
          }
          note="この子の顔がはっきり写った写真をえらんでください。写真が無いときは、年齢に合わせて描きます。"
          required={false}
          file={photos.guests?.[i] ?? null}
          face={photos.faces?.[`guest${i}`] ?? null}
          onChange={(f, face) => {
            const guests = each((j) => (j === i ? f : (photos.guests?.[j] ?? null)));
            setPhotos({ ...photos, guests, faces: { ...photos.faces, [`guest${i}`]: face ?? null } });
            if (f) setGuestSavedIds((v) => each((j) => (j === i ? null : (v[j] ?? null))));
          }}
          saved={saved}
          savedId={guestSavedIds[i] ?? null}
          onPickSaved={(id) => {
            setGuestSavedIds((v) => each((j) => (j === i ? id : (v[j] ?? null))));
            if (id) setPhotos({ ...photos, guests: each((j) => (j === i ? null : (photos.guests?.[j] ?? null))) });
          }}
          characters={[]}
          characterId={null}
          onPickCharacter={() => {}}
        />
      ))}
      <PhotoSlot
        id="mom-photo"
        title="ママ"
        note="ママを登場させたい場合にえらんでください。"
        required={false}
        file={photos.mom}
        face={photos.faces?.mom ?? null}
        onChange={(f, face) => { setPhotos({ ...photos, mom: f, faces: { ...photos.faces, mom: face ?? null } }); if (f) { setSavedIds((s) => ({ ...s, mom: null })); setCharacterIds((c) => ({ ...c, mom: null })); } }}
        saved={saved}
        savedId={savedIds.mom}
        onPickSaved={(id) => { setSavedIds((s) => ({ ...s, mom: id })); if (id) { setPhotos({ ...photos, mom: null }); setCharacterIds((c) => ({ ...c, mom: null })); } }}
        characters={characters.filter((c) => c.person === "mom")}
        characterId={characterIds.mom}
        taste={state.taste}
        onPickCharacter={(id) => { setCharacterIds((c) => ({ ...c, mom: id })); if (id) { setPhotos({ ...photos, mom: null }); setSavedIds((s) => ({ ...s, mom: null })); } }}
      />
      <PhotoSlot
        id="dad-photo"
        title="パパ"
        note="パパを登場させたい場合にえらんでください。"
        required={false}
        file={photos.dad}
        face={photos.faces?.dad ?? null}
        onChange={(f, face) => { setPhotos({ ...photos, dad: f, faces: { ...photos.faces, dad: face ?? null } }); if (f) { setSavedIds((s) => ({ ...s, dad: null })); setCharacterIds((c) => ({ ...c, dad: null })); } }}
        saved={saved}
        savedId={savedIds.dad}
        onPickSaved={(id) => { setSavedIds((s) => ({ ...s, dad: id })); if (id) { setPhotos({ ...photos, dad: null }); setCharacterIds((c) => ({ ...c, dad: null })); } }}
        characters={characters.filter((c) => c.person === "dad")}
        characterId={characterIds.dad}
        taste={state.taste}
        onPickCharacter={(id) => { setCharacterIds((c) => ({ ...c, dad: id })); if (id) { setPhotos({ ...photos, dad: null }); setSavedIds((s) => ({ ...s, dad: null })); } }}
      />
      {cast.map((c, i) => (
        <PhotoSlot
          key={i}
          id={`guest${i}-photo`}
          title={castLabel(c)}
          note={c.kind === "animal" ? "顔と体の毛の色・模様がよく分かる写真がおすすめです。写真が無いときは、お話に合わせて描きます。" : "写真があると、その人に似せて描きます。写真が無いときは、お話に合わせて描きます。"}
          required={false}
          file={photos.guests?.[i] ?? null}
          face={photos.faces?.[`guest${i}`] ?? null}
          onChange={(f, face) => {
            const guests = each((j) => (j === i ? f : (photos.guests?.[j] ?? null)));
            setPhotos({ ...photos, guests, faces: { ...photos.faces, [`guest${i}`]: face ?? null } });
            if (f) setGuestSavedIds((s) => each((j) => (j === i ? null : (s[j] ?? null))));
          }}
          saved={saved}
          savedId={guestSavedIds[i] ?? null}
          onPickSaved={(id) => {
            setGuestSavedIds((s) => each((j) => (j === i ? id : (s[j] ?? null))));
            if (id) setPhotos({ ...photos, guests: each((j) => (j === i ? null : (photos.guests?.[j] ?? null))) });
          }}
          characters={[]}
          characterId={null}
          onPickCharacter={() => {}}
        />
      ))}
      {!!state.draftId && pickedGuest && !pickedChild && (
        <p className="info-note">写真を選び直すときは、主人公の写真もえらんでください。</p>
      )}
      <section className="card" style={{ gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
          登場人物のキャラクターは、似せ方を変えた3パターン（そっくり・しっかり・ふつう）を描くので、気に入ったものを選べます（3枚でプレビュー1枚分）。
        </p>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, lineHeight: 1.6, color: "var(--navy)", cursor: "pointer" }}>
          <input type="checkbox" checked={state.plainFace} onChange={(e) => changePlainFace(e.target.checked)} style={{ marginTop: 4 }} />
          <span>
            顔の飾りを消す
            <span style={{ display: "block", fontSize: 12, color: "var(--sub)" }}>写真に写っているシール・フェイスペイント・メガネなどを、絵では描きません</span>
          </span>
        </label>
      </section>
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
      {/* 待ち画面は body に出す（項目の出てくる動き translate があると、画面ではなく長い写真の項目いっぱいに広がり、絵が画面の外に出てしまうため） */}
      {sending &&
        createPortal(
          <div className="wait-overlay">
            <DrawingWait title="写真を送っています" messages={["しゃしんを とどけています", "かおの いちを たしかめています", "えのぐを じゅんびしています"]} estimate={10} />
          </div>,
          document.body,
        )}
      {/* 作成ページの下に貼りつく（ページの左右・下の余白の外まで広げる） */}
      <div className="flow-footer">
        <NextButton onClick={submit} disabled={!canSubmit || sending}>
          {sending ? "送信中…" : "絵本をつくる"}
        </NextButton>
      </div>
    </>
  );
}
