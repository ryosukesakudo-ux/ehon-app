"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { SizeId, StoryId, TasteId } from "@/lib/catalog";

// 注文フローの入力内容。ページをまたいで保持し、再読み込みに備えて sessionStorage にも残す。
// 写真ファイル自体はメモリ上だけで持つ（ブラウザに保存しない）。
export type FlowState = {
  taste: TasteId;
  story: StoryId;
  childName: string;
  draftId: string | null;
  demo: boolean;
  previews: Record<number, string>;
  size: SizeId;
  extraCopy: boolean;
};

const initial: FlowState = {
  taste: "watercolor",
  story: "forest",
  childName: "",
  draftId: null,
  demo: false,
  previews: {},
  size: "M",
  extraCopy: false,
};

export type Photos = { child: File | null; mom: File | null; dad: File | null };

type Ctx = {
  state: FlowState;
  update: (patch: Partial<FlowState> | ((prev: FlowState) => Partial<FlowState>)) => void;
  setPreview: (scene: number, url: string) => void;
  photos: Photos;
  setPhotos: (p: Photos) => void;
  ready: boolean;
};

const FlowContext = createContext<Ctx | null>(null);
const KEY = "ehon-flow";

export function FlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FlowState>(initial);
  const [photos, setPhotos] = useState<Photos>({ child: null, mom: null, dad: null });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 保存済みの入力を一度だけ復元する
      if (saved) setState({ ...initial, ...JSON.parse(saved) });
    } catch {}
    setReady(true);
  }, []);

  const update = (patch: Partial<FlowState> | ((prev: FlowState) => Partial<FlowState>)) => {
    setState((prev) => {
      const next = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
      try {
        sessionStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

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
