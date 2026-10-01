"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

/** 作例の絵。まだ作られていない（読み込めない）ときは fallback を表示する。 */
export function SampleImage({
  src,
  alt,
  fallback,
  style,
}: {
  src: string | null;
  alt: string;
  fallback: ReactNode;
  style?: CSSProperties;
}) {
  // 読み込めなかったURLを覚えておく（src が変われば、もう一度読み込みを試す）
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Supabase の公開ストレージの画像
    <img src={src} alt={alt} onError={() => setFailedSrc(src)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...style }} />
  );
}
