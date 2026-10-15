"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BOOK_SCENE_COUNT,
  COVER_SCENE,
  FIRST_PAGES,
  MEMBER_MONTHLY_PREVIEWS,
  PERSON_LABEL,
  PREVIEW_PACK,
  packsFor,
  REDO_NOTE_MAX,
  REDO_OPTIONS,
  characterOf,
  guestOf,
  isCharacterScene,
  yen,
  type LikenessId,
  type RedoOptionId,
} from "@/lib/catalog";
import { LEVELS, bookTitle, fixedLevelEpisode, parseSeriesKey, type LevelId } from "@/lib/story-key";
import { faceToField } from "@/lib/face";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { parseCustomKey } from "@/lib/custom-story";
import { BookCover } from "@/components/book-cover";
import { RubyText } from "@/components/ruby-text";
import { Chevron } from "@/components/icons";
import { DrawingWait } from "../drawing-wait";
import { BuyPreviewsButton, startCreditCheckout } from "@/components/buy-previews";
import { useFlow } from "../flow";
import { LikenessPicker } from "../likeness-picker";
import { PhotoSwap, type PhotoChoice, type Saved } from "../photo-swap";
import { loginHref, useAccount } from "../account";
import { NextButton, StepHeader, StepTitle } from "../step";

// プレビューは3段階（2026-10-12 作道さん）：
// 1. 登場人物のキャラクターを確かめて、気になれば作り直す →「登場人物を確定」
// 2. 確定したキャラクターで表紙を描く
// 3. 本文を「冒頭3枚」か「12枚ぜんぶ」プレビューするか、プレビューせずに購入へ。冒頭3枚のあとは「残り9枚も作る」か「このまま購入へ」
// どの絵も1枚でプレビュー1枚分。作った表紙と本文の絵は、ご注文後そのまま本に使う。

/** 本文のページを同時に何枚まで作るか */
const PARALLEL_PAGES = 3;

const pageRange = (n: number) => Array.from({ length: n }, (_, i) => i);

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
  const params = useSearchParams();
  const boughtCredits = params.get("credits") === "done";
  // チャージしてから作る本文のページ数（決済から戻ったら、反映を待って自動で作る）
  const thenPages = Number(params.get("then")) || 0;
  const [charging, setCharging] = useState(false);
  const autoStarted = useRef(false);
  // 登録前のお試し（Supabase 設定済みで未ログイン）
  const trial = !!account?.configured && !account.loggedIn;
  const inFlight = useRef(new Set<number>());
  // 作り直しの指示（選択肢と一言）
  const [options, setOptions] = useState<RedoOptionId[]>([]);
  const [note, setNote] = useState("");
  const [resetting, setResetting] = useState(false);
  // 本人への似せ方（写真の画面で選んだもの。作り直しのときに変えられ、変えたら次からもそれを使う）
  const likeness = state.likeness;
  // 本文12場面の文（本に載るのと同じ文。絵の下に出して、どの場面の絵か分かるようにする）
  const [texts, setTexts] = useState<string[]>([]);
  // 文の量の切り替え（シリーズのお話で、文の量が決まっていない話だけ。絵はそのままで文だけ変わる）
  const seriesKey = parseSeriesKey(state.story);
  const levelSwitch = !!seriesKey && !fixedLevelEpisode(seriesKey.series, seriesKey.episode);
  const [levelBusy, setLevelBusy] = useState(false);
  // 写真の差し替えで選べる、会員の保存している写真
  const [savedPhotos, setSavedPhotos] = useState<Saved[]>([]);

  const custom = parseCustomKey(state.story);
  const characters = state.previewScenes.filter(isCharacterScene);
  // 登場人物を確定したか（以前の画面で表紙まで作った下書きも、確定済みとして読む）
  const confirmed = state.confirmed || !!state.previews[COVER_SCENE];
  // 作ると選んだ本文のページ数（以前に作ったページがあれば、その分は開く）
  const madePages = pageRange(BOOK_SCENE_COUNT).filter((i) => state.previews[i]);
  const pageCount = Math.max(state.pageCount, madePages.some((i) => i >= FIRST_PAGES) ? BOOK_SCENE_COUNT : madePages.length ? FIRST_PAGES : 0);
  const pages = pageRange(pageCount);
  // いま見せている絵の並び（確定前はキャラクター、確定後は表紙と本文）
  const shown = confirmed ? [COVER_SCENE, ...pages] : characters;
  const scene: number | undefined = shown[Math.min(pos, shown.length - 1)];
  const isCover = scene === COVER_SCENE;
  const title = bookTitle(state.story, state.childName);
  const nameOf = (i: number) => {
    const p = characterOf(i);
    if (p) return p === "child" ? state.childName || PERSON_LABEL.child : PERSON_LABEL[p];
    const g = guestOf(i);
    return g === null ? "" : (custom?.cast[g]?.name ?? `登場人物${g + 1}`);
  };
  const labelOf = (i: number) => (i === COVER_SCENE ? "表紙" : isCharacterScene(i) ? nameOf(i) : `${i + 1}ページ`);
  const remaining = account?.loggedIn ? account.remaining : Infinity;

  type RedoRequest = { options: RedoOptionId[]; note: string; likeness: LikenessId };

  async function generate(index: number, redo?: RedoRequest): Promise<boolean> {
    if (!state.draftId || inFlight.current.has(index)) return false;
    inFlight.current.add(index);
    setLoading((l) => ({ ...l, [index]: true }));
    setFailed((f) => {
      const next = { ...f };
      delete next[index];
      return next;
    });
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(state.draftId)}/scenes/${index}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(redo ? { ...redo, redo: true } : { likeness }),
      });
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
      // 作り直したら、保存しているキャラクターをそのまま使った絵ではなくなる
      if (state.reused?.includes(index)) update((prev) => ({ reused: prev.reused.filter((n) => n !== index) }));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "絵の作成に失敗しました");
      return false;
    } finally {
      inFlight.current.delete(index);
      setLoading((l) => ({ ...l, [index]: false }));
    }
  }

  /** 何枚かを、同時に作りすぎないように順番に作る（使い切ったら、そこで止める） */
  async function generateMany(targets: number[], redo?: RedoRequest) {
    const queue = [...targets];
    const results: boolean[] = [];
    let stop = false;
    const worker = async () => {
      while (queue.length && !stop) {
        const i = queue.shift()!;
        const ok = await generate(i, redo);
        results.push(ok);
        if (!ok) stop = true;
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_PAGES, targets.length) }, worker));
    return results.length === targets.length && results.every(Boolean);
  }

  useEffect(() => {
    if (!ready) return;
    if (!state.draftId) {
      router.replace("/create/photo");
      return;
    }
    // 以前の画面で作った下書きなど、プレビューの場面が分からないときはサーバーに聞く
    if (!state.previewScenes.length) {
      fetch(`/api/drafts/${encodeURIComponent(state.draftId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => json?.previewScenes && update({ previewScenes: json.previewScenes }))
        .catch(() => {});
      return;
    }
    // 開いたとき：確定前はキャラクター、確定後は表紙のうち、まだ無い絵を作る（本文のページはボタンで作る）
    const todo = confirmed ? (state.previews[COVER_SCENE] ? [] : [COVER_SCENE]) : characters.filter((i) => !state.previews[i]);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 読み込み中の表示もここで切り替わる
    for (const i of todo) generate(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 画面を開いたとき（と場面が分かったとき）に一度だけ作る
  }, [ready, state.draftId, state.previewScenes.length]);

  // 本文の文はサーバーで組み立てる（写真の組み合わせと名前を入れた、本に載るのと同じ文）
  useEffect(() => {
    if (!ready || !state.draftId) return;
    let alive = true;
    fetch(`/api/drafts/${encodeURIComponent(state.draftId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => alive && Array.isArray(json?.texts) && setTexts(json.texts))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, state.draftId]);

  useEffect(() => {
    if (!account?.loggedIn) return;
    fetch("/api/account/photos")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.photos && setSavedPhotos(j.photos))
      .catch(() => {});
  }, [account?.loggedIn]);

  // 文の量を切り替える（プレビューの枚数は使わない）
  async function changeLevel(level: LevelId) {
    if (!state.draftId || level === seriesKey?.level) return;
    setLevelBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(state.draftId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "文の量を変えられませんでした");
      setTexts(json.texts ?? []);
      update({ story: json.story, draftId: json.draftId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "文の量を変えられませんでした");
    } finally {
      setLevelBusy(false);
    }
  }

  // 1人だけ写真を変えて、その人のキャラクターを作り直す（ほかの人はそのまま）。写真を保存できたら true
  async function swapPhoto(target: number, choice: PhotoChoice) {
    if (!state.draftId) return false;
    const p = characterOf(target);
    const form = new FormData();
    form.set("who", p ?? `guest${guestOf(target)}`);
    setError(null);
    try {
      if ("file" in choice) {
        form.set("photo", await shrinkPhoto(choice.file));
        form.set("consent", "true");
        if (choice.face) form.set("face", faceToField(choice.face));
      } else form.set("photoId", choice.savedId);
      const res = await fetch(`/api/drafts/${encodeURIComponent(state.draftId)}/photo`, { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNeedLogin(!!json.needLogin);
        throw new Error(json.error ?? "写真の保存に失敗しました");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "写真の保存に失敗しました");
      return false;
    }
    // 前の写真で描いた絵は外して、新しい写真で描く
    update((prev) => ({
      previews: Object.fromEntries(Object.entries(prev.previews).filter(([k]) => Number(k) !== target)),
      reused: prev.reused.filter((n) => n !== target),
    }));
    void generate(target);
    return true;
  }

  // 登場人物を確定して、表紙を描く
  function confirm() {
    update({ confirmed: true });
    setPos(0);
    setOptions([]);
    setNote("");
    if (!state.previews[COVER_SCENE]) generate(COVER_SCENE);
  }

  // 登場人物に戻る：表紙と本文の絵は、直す前のキャラクターで描いたものなので消す
  async function backToCharacters() {
    const made = [COVER_SCENE, ...pageRange(BOOK_SCENE_COUNT)].filter((i) => state.previews[i]).length;
    if (made && !confirm_(`登場人物を直すと、いま作ってある表紙と本文の絵（${made}枚）は消えて、確定したあと作り直しになります（使ったプレビューの枚数は戻りません）。よろしいですか？`)) return;
    setResetting(true);
    setError(null);
    try {
      if (made && !state.demo) {
        const res = await fetch(`/api/drafts/${encodeURIComponent(state.draftId!)}/pages`, { method: "DELETE" });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "絵の削除に失敗しました");
      }
      update((prev) => ({
        confirmed: false,
        pageCount: 0,
        previews: Object.fromEntries(Object.entries(prev.previews).filter(([k]) => isCharacterScene(Number(k)))),
      }));
      setPos(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "絵の削除に失敗しました");
    } finally {
      setResetting(false);
    }
  }

  /** その枚数まで作るのに必要なプレビューの枚数（作ってあるページは数えない） */
  const costOf = (count: number) => pageRange(count).filter((i) => !state.previews[i]).length;
  // チャージ後、残り枚数の反映を待っている（そのあと自動で作る）
  const waitingCredits = !!thenPages && boughtCredits;

  // 本文のページを作る。残りが足りなければ、足りない分をチャージ（決済）してから作る（2026-10-12 作道さん）
  async function makeOrCharge(count: number) {
    const short = costOf(count) - remaining;
    if (short <= 0) return makePages(count);
    setCharging(true);
    setError(null);
    try {
      await startCreditCheckout(`/create/preview?then=${count}`, packsFor(short));
    } catch (e) {
      setError(e instanceof Error ? e.message : "購入画面を開けませんでした");
      setCharging(false);
    }
  }

  /** 作り直しなど：残りが足りなければ、足りない分をチャージ（決済）してからこの画面に戻る。足りていればそのまま作る */
  async function orCharge(cost: number, run: () => unknown) {
    const short = cost - remaining;
    if (short <= 0) return run();
    setCharging(true);
    setError(null);
    try {
      await startCreditCheckout("/create/preview", packsFor(short));
    } catch (e) {
      setError(e instanceof Error ? e.message : "購入画面を開けませんでした");
      setCharging(false);
    }
  }

  /** 足りないときの文言（例：15枚チャージして作り直す（500円）） */
  const withCharge = (cost: number, text: string, plain: string) => {
    const short = cost - remaining;
    if (short <= 0) return plain;
    const packs = packsFor(short);
    return `${PREVIEW_PACK.credits * packs}枚チャージして${text}（${yen(PREVIEW_PACK.price * packs)}）`;
  };

  /** ボタンの文言：足りないときはチャージする枚数と金額を添える */
  const pagesLabel = (count: number, text: string) => {
    const cost = costOf(count);
    const short = cost - remaining;
    if (short <= 0) return `${text}（${cost}枚）`;
    const packs = packsFor(short);
    return `${PREVIEW_PACK.credits * packs}枚チャージして${text}（${yen(PREVIEW_PACK.price * packs)}）`;
  };

  // 本文のページを作る（冒頭3枚・12枚ぜんぶ・残り9枚）
  async function makePages(count: number) {
    update({ pageCount: count });
    const targets = pageRange(count).filter((i) => !state.previews[i]);
    if (targets.length) setPos(1 + targets[0]);
    await generateMany(targets);
  }

  // 作り直し：いま見ている絵だけ、または登場人物全員をまとめて。うまくいったら選択肢と一言を空にする
  async function redoScenes(targets: number[]) {
    const req = { options, note: note.trim(), likeness };
    if (await generateMany(targets, req)) {
      setOptions([]);
      setNote("");
    }
  }

  const url = scene === undefined ? undefined : state.previews[scene];
  const drawing = Object.values(loading).some(Boolean);
  const coverDone = !!state.previews[COVER_SCENE];
  // 表紙の絵を待っている（描いている途中の画面が出ている）間も、ボタンは押せないようにする（2026-10-15 作道さん）
  const coverWaiting = confirmed && !coverDone && !failed[COVER_SCENE];
  const busy = drawing || resetting || coverWaiting;

  // 確定後に表紙がまだ無く、描いてもいないときは、この画面で一度だけ描きはじめる（「描いています」のまま止まらないように）
  const coverKicked = useRef(false);
  useEffect(() => {
    if (!ready || !state.draftId || !state.previewScenes.length || !coverWaiting || loading[COVER_SCENE] || coverKicked.current) return;
    coverKicked.current = true;
    void generate(COVER_SCENE);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 表紙を待っているのに描いていないときだけ
  }, [ready, state.draftId, state.previewScenes.length, coverWaiting, loading]);

  // 絵を作っている間に再読み込み・画面を閉じると、同じ絵をもう一度作ってプレビューを2枚使ってしまうので、ブラウザの確認を出す
  useEffect(() => {
    if (!drawing) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drawing]);

  // 追加プレビューの購入直後は、反映されるまで残り枚数を数秒ごとに読み直す（最大1分）
  useEffect(() => {
    if (!boughtCredits) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (tries > 12) window.clearInterval(timer);
      else refreshAccount();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [boughtCredits, refreshAccount]);

  // チャージして戻ってきたら、残りが足りた時点で本文のページを自動で作る（1回だけ）
  useEffect(() => {
    if (!thenPages || !boughtCredits || !ready || !confirmed || autoStarted.current || !account?.loggedIn) return;
    if (account.remaining < costOf(thenPages)) return;
    autoStarted.current = true;
    router.replace("/create/preview");
    void makePages(thenPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 残り枚数が反映されたときに一度だけ作る
  }, [thenPages, boughtCredits, ready, confirmed, account]);
  const charactersDone = characters.length > 0 && characters.every((i) => state.previews[i]);
  const missingPages = pages.filter((i) => !state.previews[i]);
  // 次の操作に必要なプレビューの枚数（足りないときは追加のボタンを出す）
  const needed = !confirmed ? Math.max(1, characters.length > 1 ? characters.length : 1) : pageCount === 0 ? FIRST_PAGES : pageCount < BOOK_SCENE_COUNT ? BOOK_SCENE_COUNT - FIRST_PAGES : 1;
  const failure = scene === undefined || url || loading[scene] ? undefined : failed[scene];
  const isChar = scene !== undefined && isCharacterScene(scene);
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
    ) : url && !loading[scene!] ? (
      // 描き上がった絵は、ぱっと出てきらりと光る（key で絵が変わるたびに動かす）
      // eslint-disable-next-line @next/next/no-img-element -- 署名付きURLの一時画像
      <img key={url} className="reveal-pop" src={url} alt={isCover ? "表紙の絵" : isChar ? `${nameOf(scene!)}のキャラクター` : `${scene! + 1}ページの絵`} style={{ width: "100%", height: "100%", objectFit: isChar ? "contain" : "cover" }} />
    ) : scene !== undefined && !loading[scene] && !isChar && !isCover ? (
      // まだ作っていない本文のページ（作る途中で止まったときなど）
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 24, textAlign: "center", color: "var(--sub)", fontSize: 13 }}>
        <span>このページの絵はまだありません。</span>
        <button type="button" className="ghost" disabled={busy || charging} onClick={() => orCharge(1, () => generate(scene))}>
          {withCharge(1, "このページの絵を作る", "このページの絵を作る（プレビュー1枚）")}
        </button>
      </div>
    ) : (
      <DrawingWait
        name={state.childName}
        what={scene === undefined ? "絵" : isCover ? "表紙" : isChar ? `${nameOf(scene)}のキャラクター` : `${scene + 1}ページの絵`}
      />
    );

  return (
    <>
      <StepHeader step={4} back="/create/photo" />
      <main className="step-body">
        <StepTitle
          title={confirmed ? "表紙と本文を確認してください" : "登場人物を確認してください"}
          lead={
            confirmed
              ? "気になる絵は作り直せます。本文は、冒頭3枚か12枚ぜんぶをプレビューで作れます（1枚でプレビュー1枚分）。"
              : "気になるところは作り直せます。確定すると、この姿で表紙と本文を描きます。"
          }
        />
        {state.demo && (
          <p className="demo-note">デモモードで動いています。実際の絵の代わりに仮の画像を表示しています。</p>
        )}
        <ol className="preview-steps" aria-label="プレビューの進み方">
          <li className={confirmed ? "done" : "on"}>登場人物</li>
          <li className={confirmed && !pageCount ? "on" : confirmed ? "done" : ""}>表紙</li>
          <li className={pageCount ? "on" : ""}>本文（任意）</li>
        </ol>
        {drawing && <p className="info-note" role="status">絵を作っています。完成まで画面の再読み込みや移動はしないでください。</p>}
        <div style={{ display: "flex", flexDirection: "column", borderRadius: 18, overflow: "hidden", background: "#fff", border: "1px solid var(--line)" }}>
          {isCover ? (
            <BookCover lead={title.lead} title={title.main} art={picture} />
          ) : (
            <div style={{ aspectRatio: "1 / 1", background: isChar ? "#fff" : "#E6EEF9", display: "flex", alignItems: "center", justifyContent: "center" }}>{picture}</div>
          )}
          <p style={{ margin: 0, padding: 18, fontSize: 16, lineHeight: 1.9 }}>
            {scene === undefined ? (
              ""
            ) : isCover ? (
              "表紙"
            ) : isChar ? (
              <>
                <strong>{nameOf(scene)}のキャラクター</strong>
                {state.reused?.includes(scene) && (
                  <>
                    <br />
                    <span className="reused-badge">保存しているキャラクターをそのまま使っています（プレビュー消費なし）</span>
                  </>
                )}
                <br />
                <span style={{ fontSize: 13, color: "var(--sub)" }}>この姿をもとに、表紙と本文を描きます。</span>
              </>
            ) : (
              <>
                <strong>{scene + 1}ページ</strong>
                {texts[scene] && (
                  <>
                    <br />
                    <span style={{ fontSize: 15, lineHeight: 2.1, whiteSpace: "pre-wrap" }}>
                      <RubyText text={texts[scene]} />
                    </span>
                  </>
                )}
                {levelSwitch && (
                  <span className="level-switch" role="group" aria-label="文の量">
                    <span>文の量</span>
                    {LEVELS.map((l) => (
                      <button key={l.id} type="button" aria-pressed={seriesKey?.level === l.id} disabled={levelBusy} onClick={() => changeLevel(l.id)}>
                        {l.name}
                      </button>
                    ))}
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button type="button" className="ghost" aria-label="前の絵" style={{ width: 44, height: 44, padding: 0, borderRadius: 22 }} disabled={pos === 0} onClick={() => setPos(Math.max(0, pos - 1))}>
            <Chevron dir="left" size={20} />
          </button>
          <div style={{ fontSize: 14, color: "var(--sub)" }}>
            {scene === undefined ? "" : labelOf(scene)}（{Math.min(pos, shown.length - 1) + 1} / {shown.length || 1}）
          </div>
          <button type="button" className="ghost" aria-label="次の絵" style={{ width: 44, height: 44, padding: 0, borderRadius: 22 }} disabled={pos >= shown.length - 1} onClick={() => setPos(pos + 1)}>
            <Chevron dir="right" size={20} />
          </button>
        </div>
        {shown.length > 1 && (
          <div className="preview-thumbs" role="tablist" aria-label="絵を選ぶ">
            {shown.map((i, n) => (
              <button key={i} type="button" role="tab" aria-selected={i === scene} aria-label={labelOf(i)} onClick={() => setPos(n)} className="preview-thumb">
                {state.previews[i] && !loading[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 署名付きURLの一時画像
                  <img src={state.previews[i]} alt="" style={{ width: "100%", height: "100%", objectFit: isCharacterScene(i) ? "contain" : "cover" }} />
                ) : (
                  <span>{loading[i] ? "…" : i === COVER_SCENE ? "表紙" : isCharacterScene(i) ? nameOf(i).slice(0, 3) : i + 1}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {trial ? (
          <Link href={loginHref("/create/preview")} className="ghost">
            作り直しと本文のプレビューは無料会員登録で（月{MEMBER_MONTHLY_PREVIEWS}枚まで）
          </Link>
        ) : (
          scene !== undefined && (state.previews[scene] || failed[scene]) && (
            <section className="card" style={{ gap: 10 }}>
              <div className="display" style={{ fontSize: 15, fontWeight: 800, color: "var(--navy)" }}>
                {isCover ? "表紙の絵を作り直す" : isChar ? `${nameOf(scene)}のキャラクターを作り直す` : `${scene + 1}ページの絵を作り直す`}
              </div>
              <div style={{ fontSize: 12, color: "var(--sub)" }}>直したいところを選んでください（いくつでも・選ばなくても作り直せます）</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {REDO_OPTIONS.map((o) => {
                  const on = options.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setOptions((v) => (on ? v.filter((x) => x !== o.id) : [...v, o.id]))}
                      style={{ height: 36, padding: "0 14px", borderRadius: 18, fontSize: 13, cursor: "pointer", border: on ? "2px solid var(--coral)" : "1px solid var(--line)", background: on ? "#FDECE8" : "#fff", color: "var(--navy)", fontWeight: on ? 700 : 500 }}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--sub)" }}>
                ひとこと（任意・{REDO_NOTE_MAX}文字まで）
                <input
                  type="text"
                  value={note}
                  maxLength={REDO_NOTE_MAX}
                  placeholder={isChar ? "例：メガネをかけて／前髪を短く" : "例：もっと笑顔で／空を夕焼けに"}
                  onChange={(e) => setNote([...e.target.value].slice(0, REDO_NOTE_MAX).join(""))}
                  style={{ height: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 16 }}
                />
                <span style={{ alignSelf: "flex-end" }}>{[...note].length} / {REDO_NOTE_MAX}</span>
              </label>
              <LikenessPicker value={likeness} onChange={(v) => update({ likeness: v })} />
              <button type="button" className="ghost" disabled={!!loading[scene] || resetting || charging} onClick={() => orCharge(1, () => redoScenes([scene]))}>
                {(() => {
                  const text = options.length || note.trim() || likeness !== "normal" ? "この内容で作り直す" : "そのまま作り直す";
                  return withCharge(1, text, `${text}（プレビュー1枚）`);
                })()}
              </button>
              {!confirmed && characters.length > 1 && (
                <>
                  <button type="button" className="ghost" disabled={characters.some((i) => loading[i]) || charging} onClick={() => orCharge(characters.length, () => redoScenes(characters))}>
                    {withCharge(characters.length, `登場人物${characters.length}人まとめて作り直す`, `登場人物${characters.length}人まとめて作り直す（${characters.length}枚）`)}
                  </button>
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
                    {characters.map(nameOf).join("・")}
                    のキャラクターを、上で選んだ内容でいっしょに作り直します。
                    {remaining < characters.length && "（残りが足りないので、先にチャージの画面に進みます。支払いのあと、この画面に戻ります）"}
                  </div>
                </>
              )}
              {!confirmed && isChar && (
                <PhotoSwap
                  key={scene}
                  name={nameOf(scene)}
                  saved={savedPhotos}
                  disabled={!!loading[scene] || resetting || charging}
                  label={withCharge(1, "この写真で作り直す", "この写真で作り直す（プレビュー1枚）")}
                  onSubmit={(choice) => {
                    if (remaining >= 1) return swapPhoto(scene, choice);
                    void orCharge(1, () => {});
                    return Promise.resolve(false);
                  }}
                />
              )}
            </section>
          )
        )}

        {/* 表紙ができたら、本文のプレビューをどうするか選ぶ */}
        {confirmed && coverDone && !trial && pageCount === 0 && (
          <section className="card" style={{ gap: 10 }}>
            <div className="display" style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>本文のプレビュー</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--sub)" }}>
              作った本文の絵は、ご注文後そのまま絵本に使います。作らなかったページは、ご注文後にこのキャラクターで描きます。
            </div>
            <button type="button" className="cta" disabled={busy || charging || waitingCredits} onClick={() => makeOrCharge(FIRST_PAGES)}>
              {pagesLabel(FIRST_PAGES, `冒頭${FIRST_PAGES}枚をプレビュー`)}
            </button>
            <button type="button" className="ghost" disabled={busy || charging || waitingCredits} onClick={() => makeOrCharge(BOOK_SCENE_COUNT)}>
              {pagesLabel(BOOK_SCENE_COUNT, `${BOOK_SCENE_COUNT}枚ぜんぶ作って調整`)}
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={() => router.push("/create/size")}>
              プレビューせず購入へ
            </button>
          </section>
        )}
        {confirmed && pageCount === FIRST_PAGES && !missingPages.length && !trial && (
          <section className="card" style={{ gap: 10 }}>
            <div className="display" style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>冒頭{FIRST_PAGES}枚ができました</div>
            <button type="button" className="cta" disabled={busy || charging || waitingCredits} onClick={() => makeOrCharge(BOOK_SCENE_COUNT)}>
              {pagesLabel(BOOK_SCENE_COUNT, `残り${BOOK_SCENE_COUNT - FIRST_PAGES}枚も作る`)}
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={() => router.push("/create/size")}>
              このまま購入へ
            </button>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>残りのページは、ご注文後にこのキャラクターで描きます。</div>
          </section>
        )}
        {confirmed && !trial && (
          <button type="button" className="ghost" style={{ alignSelf: "center", height: 40, padding: "0 18px", fontSize: 14 }} disabled={busy} onClick={backToCharacters}>
            {resetting ? "もどしています…" : "登場人物を直す"}
          </button>
        )}

        {account?.loggedIn && (
          <p className="step-lead" style={{ textAlign: "center", fontSize: 13 }}>
            プレビュー残り：{account.remaining}枚
            {typeof account.free === "number" && `（今月の無料 ${account.free} / ${account.limit}枚${account.credits ? `＋追加 ${account.credits}枚` : ""}）`}
          </p>
        )}
        {boughtCredits && (
          <p className="info-note" role="status">
            ご購入ありがとうございます。残り枚数は数十秒ほどで自動的に反映されます。
            {waitingCredits && "反映されたら、本文の絵を自動で作りはじめます。"}
          </p>
        )}
        {charging && <p className="info-note" role="status">購入画面を開いています…</p>}
        {/* 残りが次の操作に足りないときは、追加のボタンを出す */}
        {account?.loggedIn && account.remaining < needed && <BuyPreviewsButton returnTo="/create/preview" disabled={busy} />}
        {error && <p className="error" role="alert">{error}</p>}
        {needLogin && !trial && (
          <Link href={loginHref("/create/preview")} className="ghost">無料会員登録・ログインへ</Link>
        )}
      </main>
      {!confirmed ? (
        <NextButton onClick={confirm} disabled={!charactersDone || busy}>登場人物を確定して表紙をつくる</NextButton>
      ) : trial ? (
        <NextButton href={loginHref("/create/size")} disabled={!coverDone || busy}>無料会員登録して注文へ進む</NextButton>
      ) : (
        <NextButton href="/create/size" disabled={!coverDone || busy}>この内容で進む</NextButton>
      )}
    </>
  );
}

/** ブラウザの確認ダイアログ（関数名の confirm は登場人物の確定に使っているため） */
function confirm_(message: string) {
  return window.confirm(message);
}
