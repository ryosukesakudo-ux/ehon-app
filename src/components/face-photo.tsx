"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Face } from "@/lib/face";

// 顔を囲んで選んだ写真を、囲んだ所以外をうすく暗くして表示する（顔をえらぶ画面と同じ見た目）。
// 何人か写っている写真でも、どの人を選んだか後から分かるようにする。
// 暗くする部分は写真と同じ縮尺の SVG で重ねるので、contain（全体表示）でも cover（切り抜き表示）でもずれない。
export function FacePhoto({
  src,
  alt,
  face,
  fit = "contain",
  style,
}: {
  src: string;
  alt: string;
  face: Face | null | undefined;
  fit?: "contain" | "cover";
  style?: CSSProperties;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const measure = () => {
    const img = imgRef.current;
    if (img?.naturalWidth) setSize({ w: img.naturalWidth, h: img.naturalHeight });
  };
  // 画面の準備より先に読み込み終わっていたとき
  useEffect(measure, [src]);

  const f = face && size ? { x: face.x * size.w, y: face.y * size.h, w: face.w * size.w, h: face.h * size.h } : null;
  return (
    <span style={{ position: "relative", display: "block", width: "100%", height: "100%", ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 選んだ写真・署名付きURLの一時画像 */}
      <img ref={imgRef} src={src} alt={alt} onLoad={measure} style={{ display: "block", width: "100%", height: "100%", objectFit: fit }} />
      {f && size && (
        <svg
          viewBox={`0 0 ${size.w} ${size.h}`}
          preserveAspectRatio={fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        >
          <path
            fillRule="evenodd"
            fill="rgba(0, 0, 0, 0.45)"
            d={`M0 0H${size.w}V${size.h}H0Z M${f.x} ${f.y}h${f.w}v${f.h}h${-f.w}Z`}
          />
          <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="none" stroke="#f08a6c" strokeWidth={3} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </span>
  );
}
