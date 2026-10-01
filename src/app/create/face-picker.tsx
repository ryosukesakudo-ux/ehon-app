"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

// 写真に何人か写っているとき、登場させたい人の顔を四角で囲んで選ぶ画面。
// 囲んだ範囲より少し広め（髪型や服が入るくらい）を切り出して、AIに渡す写真にする。

// 枠の位置と大きさ（画面に表示している写真の上でのピクセル）
type Box = { x: number; y: number; size: number };

const MARGIN = 2; // 囲んだ顔の何倍の範囲を切り出すか
const MAX_EDGE = 1600;

export function FacePicker({
  file,
  title,
  onDone,
  onCancel,
}: {
  file: File;
  title: string;
  onDone: (cropped: File) => void;
  onCancel: () => void;
}) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const imgRef = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ mode: "move" | "resize"; startX: number; startY: number; start: Box } | null>(null);

  function onLoad() {
    const img = imgRef.current!;
    const w = img.clientWidth;
    const h = img.clientHeight;
    setView({ w, h });
    const size = Math.round(Math.min(w, h) * 0.4);
    setBox({ x: Math.round((w - size) / 2), y: Math.round((h - size) / 3), size });
  }

  const clamp = (b: Box): Box => {
    if (!view) return b;
    const size = Math.max(40, Math.min(b.size, view.w, view.h));
    return {
      size,
      x: Math.min(Math.max(0, b.x), view.w - size),
      y: Math.min(Math.max(0, b.y), view.h - size),
    };
  };

  function start(e: ReactPointerEvent, mode: "move" | "resize") {
    if (!box) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start: box };
  }

  function move(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.mode === "move") setBox(clamp({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }));
    else setBox(clamp({ ...d.start, size: d.start.size + Math.max(dx, dy) }));
  }

  // 写真のほかの場所をタップしたら、そこへ枠を移す
  function tap(e: ReactPointerEvent<HTMLDivElement>) {
    if (!box || drag.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setBox(clamp({ ...box, x: e.clientX - rect.left - box.size / 2, y: e.clientY - rect.top - box.size / 2 }));
  }

  async function crop(whole: boolean) {
    if (!view || !box) return;
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const k = bitmap.width / view.w; // 表示ピクセル → 元の写真のピクセル
      let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
      if (!whole) {
        const side = Math.min(box.size * MARGIN * k, bitmap.width, bitmap.height);
        const cx = (box.x + box.size / 2) * k;
        // 顔より下（肩や服）を多めに入れる
        const cy = (box.y + box.size * 0.65) * k;
        sw = sh = side;
        sx = Math.min(Math.max(0, cx - side / 2), bitmap.width - side);
        sy = Math.min(Math.max(0, cy - side / 2), bitmap.height - side);
      }
      const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sw * scale);
      canvas.height = Math.round(sh * scale);
      canvas.getContext("2d")!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
      if (!blob) throw new Error("crop failed");
      onDone(new File([blob], "photo.jpg", { type: "image/jpeg" }));
    } catch {
      alert("写真を読み込めませんでした。別の写真をお試しください");
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`${title}の顔をえらぶ`} className="face-picker">
      <div className="face-picker-inner">
        <div className="display" style={{ fontSize: 18, fontWeight: 900, color: "var(--navy)" }}>{title}の顔を囲んでください</div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--sub)" }}>
          何人か写っている写真は、登場させたい人の顔に枠を合わせてください。枠は指で動かせます。右下の丸で大きさを変えられます。
        </p>
        <div className="face-picker-stage" onPointerDown={tap}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 選んだ写真のその場プレビュー */}
          <img ref={imgRef} src={url} alt="選んだ写真" onLoad={onLoad} draggable={false} />
          {box && (
            <div
              className="face-picker-box"
              style={{ left: box.x, top: box.y, width: box.size, height: box.size }}
              onPointerDown={(e) => start(e, "move")}
              onPointerMove={move}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
            >
              <span
                className="face-picker-handle"
                aria-label="枠の大きさを変える"
                onPointerDown={(e) => start(e, "resize")}
                onPointerMove={move}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
              />
            </div>
          )}
        </div>
        <button type="button" className="cta" disabled={!box || busy} onClick={() => crop(false)}>
          {busy ? "準備しています…" : "この人にする"}
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="ghost" style={{ flex: 1, fontSize: 13 }} disabled={!box || busy} onClick={() => crop(true)}>
            1人だけなので写真全体を使う
          </button>
          <button type="button" className="ghost" style={{ flex: "0 0 auto", fontSize: 13, borderColor: "#d9cfbd", color: "var(--sub)" }} disabled={busy} onClick={onCancel}>
            やめる
          </button>
        </div>
      </div>
    </div>
  );
}
