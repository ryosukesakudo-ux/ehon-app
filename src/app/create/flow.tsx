"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { BOOK_SCENE_COUNT, FIRST_PAGES, clampCopies, getSize, isLikenessId, type LikenessId, type SizeId, type TasteId } from "@/lib/catalog";
import { isStoryKey, parseSeriesKey, withoutCombo } from "@/lib/story-key";
import { parseCustomKey } from "@/lib/custom-story";
import type { Face } from "@/lib/face";
import { readLocalFlow, readLocalPhotos, writeLocalFlow, writeLocalPhotos } from "./flow-storage";

// 注文フローの入力内容。ページをまたいで保持し、ログインや再読み込みに備えてブラウザ（localStorage）にも残す。
// 選んだ写真は、送るまでこのブラウザの IndexedDB に残す（ログインから戻っても選び直さなくて済むように）。
export type FlowState = {
  taste: TasteId;
  /** お話の番号（旧版のお話 "forest" か、シリーズの "forest:2:n"。story-key.ts） */
  story: string;
  childName: string;
  childAge: number | null;
  /** 主人公のお誕生日（YYYY-MM-DD・任意）。誕生日の1か月前に続編のご案内メールを送る */
  childBirthday: string;
  /** 主人公の呼び方（kun / chan / none。catalog.ts の HONORIFICS）。登場人物しょうかいなどの特別ページで使う。空は未選択 */
  childHonorific: string;
  /** 本人への似せ方（写真の画面で選ぶ。プレビューの最初の作成から使う） */
  likeness: LikenessId;
  /** 写真の顔の飾り（シール・メガネなど）を絵では描かない（写真の画面のチェック） */
  plainFace: boolean;
  draftId: string | null;
  demo: boolean;
  previews: Record<number, string>;
  /** プレビューで最初に作る絵の番号（登場人物のキャラクターと表紙）。下書きを作ったときにサーバーが決める */
  previewScenes: number[];
  /** 登場人物のキャラクターを確定したか（確定すると表紙を作る） */
  confirmed: boolean;
  /** プレビューで作ると選んだ本文のページ数（0・冒頭3枚・12枚） */
  pageCount: number;
  /** 保存しているキャラクターをそのまま使った絵の番号（プレビューの枚数を使っていない） */
  reused: number[];
  size: SizeId;
  /** 部数（1〜10） */
  copies: number;
  /** まとめて買う同じシリーズのほかの話（2026-10-16）。extraFor の下書きのときだけ使う（別の下書きに変わったら無視する） */
  extraEpisodes: number[];
  /** ほかの話のプレビューを作ったときの、その話の下書き（話の番号 → 下書き） */
  extraDrafts: Record<string, string>;
  extraFor: string;
  /** 絵本の最後のページに入れる、おうちの方からのメッセージ（任意） */
  bookMessage: string;
  /**
   * 思い出の写真（任意・注文の確認画面でアップロード、20枚まで）の保存先。アップした順に、お話のあとの6ページに分けて並べる。
   * 空は無し（そのページはおえかきページになる）
   */
  memoryPhotoPaths: string[];
  /** お届け希望日（YYYY-MM-DD）。空は最短 */
  deliveryDate: string;
  /** お届け時間帯（以前の保存データとの互換用。いまは選べない） */
  deliveryTime: string;
  /** 作成画面（1ページ）で、どの項目まで出したか（taste / profile / story / photo）。選ぶ・「次へ」で1つずつ下に出す */
  reached: string;
  /** 最後に開いていた作成画面（ログイン後の「つづきから」で戻る先） */
  path: string;
};

const initial: FlowState = {
  taste: "watercolor",
  // お話はお話選びの画面で選ぶ（1話だけのお話は 2026-10-11 に非表示にしたので、最初は未選択）
  story: "",
  childName: "",
  childAge: null,
  childBirthday: "",
  childHonorific: "",
  likeness: "normal",
  plainFace: false,
  draftId: null,
  demo: false,
  previews: {},
  previewScenes: [],
  confirmed: false,
  pageCount: 0,
  reused: [],
  size: "M",
  copies: 1,
  extraEpisodes: [],
  extraDrafts: {},
  extraFor: "",
  bookMessage: "",
  memoryPhotoPaths: [],
  deliveryDate: "",
  deliveryTime: "",
  path: "/create/taste",
  reached: "taste",
};

export type Photos = {
  child: File | null;
  mom: File | null;
  dad: File | null;
  /** オリジナルのお話の、ほかの登場人物の写真（お話の登場人物の順） */
  guests?: (File | null)[];
  /** 顔を囲んだ位置（何人か写っている写真で、どの人を選んだか分かるように表示する）。ほかの登場人物は guest0, guest1… */
  faces?: Partial<Record<string, Face | null>>;
};

/** 写真を1枚も選んでいないか */
export function noPhotos(p: Photos) {
  return !p.child && !p.mom && !p.dad && !p.guests?.some(Boolean);
}

type Ctx = {
  state: FlowState;
  update: (patch: Partial<FlowState> | ((prev: FlowState) => Partial<FlowState>)) => void;
  setPreview: (scene: number, url: string) => void;
  photos: Photos;
  setPhotos: (p: Photos) => void;
  ready: boolean;
};

const FlowContext = createContext<Ctx | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FlowState>(initial);
  const [photos, setPhotosState] = useState<Photos>({ child: null, mom: null, dad: null });
  const setPhotos = (p: Photos) => {
    setPhotosState(p);
    void writeLocalPhotos(p, noPhotos(p));
  };
  const [ready, setReady] = useState(false);

  const update = (patch: Partial<FlowState> | ((prev: FlowState) => Partial<FlowState>)) => {
    setState((prev) => {
      const next = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
      writeLocalFlow(next);
      return next;
    });
  };

  useEffect(() => {
    const saved = readLocalFlow();
    if (saved) {
      const restored: FlowState = { ...initial, ...(saved as Partial<FlowState>) };
      // 販売をやめたサイズ（L）が残っていたら M に戻す
      if (!getSize(restored.size)) restored.size = initial.size;
      restored.story = withoutCombo(String(restored.story ?? ""));
      // 非表示にした1話だけのお話が残っていたら、選び直してもらう
      if (!isStoryKey(restored.story) || !(parseSeriesKey(restored.story) || parseCustomKey(restored.story))) restored.story = initial.story;
      restored.copies = clampCopies(restored.copies);
      restored.extraEpisodes = Array.isArray(restored.extraEpisodes) ? restored.extraEpisodes.filter((n) => Number.isInteger(n)) : [];
      restored.extraDrafts = restored.extraDrafts && typeof restored.extraDrafts === "object" ? restored.extraDrafts : {};
      restored.extraFor = typeof restored.extraFor === "string" ? restored.extraFor : "";
      // 2026-10-16 より前の保存は写真1枚（memoryPhotoPath）
      const oldPhoto = (saved as { memoryPhotoPath?: unknown }).memoryPhotoPath;
      restored.memoryPhotoPaths = Array.isArray(restored.memoryPhotoPaths)
        ? restored.memoryPhotoPaths.filter((p) => typeof p === "string")
        : typeof oldPhoto === "string" && oldPhoto
          ? [oldPhoto]
          : [];
      if (!isLikenessId(restored.likeness)) restored.likeness = initial.likeness;
      restored.plainFace = restored.plainFace === true;
      restored.confirmed = restored.confirmed === true;
      restored.reused = Array.isArray(restored.reused) ? restored.reused.filter((n) => typeof n === "number") : [];
      restored.pageCount = [0, FIRST_PAGES, BOOK_SCENE_COUNT].includes(restored.pageCount) ? restored.pageCount : 0;
      // 2026-10-14 より前の保存（どこまで出したかの記録が無い）は、済んでいる項目をすべて出す
      if (!["taste", "profile", "story", "photo"].includes(restored.reached)) restored.reached = (saved as Partial<FlowState>).childName ? "photo" : "taste";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 保存済みの入力を一度だけ復元する
      setState(restored);
      // 作成済みの絵のURLは1時間で切れるので、下書きがあれば読み直す（ログイン後は会員の下書きとして読める）
      if (restored.draftId && !restored.demo && Object.keys(restored.previews).length) {
        fetch(`/api/drafts/${encodeURIComponent(restored.draftId)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => json?.previews && update({ previews: json.previews, previewScenes: json.previewScenes ?? restored.previewScenes }))
          .catch(() => {});
      }
    }
    setReady(true);
    // 送る前の写真が残っていれば戻す（先にこの画面で選び直していたら、そちらを優先）
    readLocalPhotos<Photos>().then((p) => {
      if (p && !noPhotos(p)) setPhotosState((cur) => (noPhotos(cur) ? p : cur));
    });
  }, []);

  const setPreview = (scene: number, url: string) =>
    update((prev) => ({ previews: { ...prev.previews, [scene]: url } }));

  return (
    <FlowContext.Provider value={{ state, update, setPreview, photos, setPhotos, ready }}>{children}</FlowContext.Provider>
  );
}

export function useFlow() {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error("useFlow must be used inside FlowProvider");
  return ctx;
}

/** まとめて買うほかの話（今の下書きで選んだものだけ） */
export function chosenExtras(state: FlowState) {
  return state.draftId && state.extraFor === state.draftId ? state.extraEpisodes : [];
}
