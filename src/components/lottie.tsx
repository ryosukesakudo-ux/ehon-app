"use client";

import { useEffect, useRef, type CSSProperties } from "react";

// public/lottie/*.json を再生する。LottieFiles でダウンロードした JSON を同じ名前で置けば差し替わる。
// 動きを減らす設定の人には、最後のコマ（ループものは途中のコマ）を止め絵で見せる。
export function Lottie({
  name,
  loop = true,
  className,
  style,
}: {
  name: "sparkles" | "drawing" | "confetti" | "check";
  loop?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let anim: { destroy: () => void } | undefined;
    let cancelled = false;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    (async () => {
      const [{ default: lottie }, data] = await Promise.all([
        import("lottie-web/build/player/lottie_light"),
        fetch(`/lottie/${name}.json`).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (cancelled || !box.current || !data) return;
      const a = lottie.loadAnimation({ container: box.current, renderer: "svg", loop: still ? false : loop, autoplay: !still, animationData: data });
      if (still) a.goToAndStop(loop ? Math.floor(a.totalFrames / 2) : a.totalFrames - 1, true);
      anim = a;
    })().catch(() => {});
    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, [name, loop]);

  return <div ref={box} aria-hidden="true" className={className} style={{ pointerEvents: "none", ...style }} />;
}
