"use client";

import Image from "next/image";
import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * 作例の絵。まだ作られていない（読み込めない）ときは fallback を表示する。
 * 元の絵は大きな PNG なので、Vercel の画像最適化で表示サイズに縮めた WebP/AVIF にして配信する
 * （Supabase からの読み込みは最適化のキャッシュが切れたときだけになり、送信量を抑えられる）。
 */
export function SampleImage({
  src,
  alt,
  fallback,
  style,
  sizes = "(max-width: 640px) 100vw, 640px",
}: {
  src: string | null;
  alt: string;
  fallback: ReactNode;
  style?: CSSProperties;
  /** 画面上での表示幅の目安。小さく出す所では小さい値にすると、さらに軽くなる */
  sizes?: string;
}) {
  // 読み込めなかったURLを覚えておく（src が変われば、もう一度読み込みを試す）
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <>{fallback}</>;
  return (
    <Image
      src={src}
      alt={alt}
      width={1024}
      height={1024}
      sizes={sizes}
      onError={() => setFailedSrc(src)}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...style }}
    />
  );
}
