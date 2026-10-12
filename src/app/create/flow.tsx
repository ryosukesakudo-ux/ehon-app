"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { clampCopies, getSize, isLikenessId, type LikenessId, type SizeId, type TasteId } from "@/lib/catalog";
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
  /** 本人への似せ方（写真の画面で選ぶ。プレビューの最初の作成から使う） */
  likeness: LikenessId;
  draftId: string | null;
  demo: boolean;
  previews: Record<number, string>;
  /** プレビューで作る絵の番号（表紙・ママ・パパ）。下書きを作ったときにサーバーが決める */
  previewScenes: number[];
  size: SizeId;
  /** 部数（1〜10） */
  copies: number;
  /** お届け希望日（YYYY-MM-DD）。空は最短 */
  deliveryDate: string;
  /** お届け時間帯（以前の保存データとの互換用。いまは選べない） */
  deliveryTime: string;
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
  likeness: "normal",
  draftId: null,
  demo: false,
  previews: {},
  previewScenes: [],
  size: "M",
  copies: 1,
  deliveryDate: "",
  deliveryTime: "",
  path: "/create/taste",
};

export type Photos = {
  child: File | null;
  mom: File | null;
  dad: File | null;
  /** 顔を囲んだ位置（何人か写っている写真で、どの人を選んだか分かるように表示する） */
  faces?: Partial<Record<"child" | "mom" | "dad", Face | null>>;
};

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
    void writeLocalPhotos(p, !p.child && !p.mom && !p.dad);
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
      if (!isLikenessId(restored.likeness)) restored.likeness = initial.likeness;
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
      if (p && (p.child || p.mom || p.dad)) setPhotosState((cur) => (cur.child || cur.mom || cur.dad ? cur : p));
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
