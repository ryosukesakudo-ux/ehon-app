"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Face } from "@/lib/face";

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
  onError,
}: {
  file: File;
  title: string;
  /** face：切り出した写真のどこを囲んだか（写真全体を使うときは null） */
  onDone: (cropped: File, face: Face | null) => void;
  onCancel: () => void;
  /** 写真をブラウザで表示できなかったとき（このままだと枠が出ず、先へ進めない） */
  onError: () => void;
}) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const imgRef = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ mode: "move" | "resize"; id: number; startX: number; startY: number; start: Box } | null>(null);

  // 写真が表示できたら枠を出す。表示サイズが変わったら（画面の向き・アドレスバーの出入りなど）、枠も同じ割合で合わせる。
  // iPhone の Safari では写真の読み込み完了（onLoad）が届かず枠が出ないことがあったので（2026-10-15 作道さん）、
  // 表示サイズの監視と、出した直後の読み込み済みチェックでも枠を出す。
  const viewRef = useRef<{ w: number; h: number } | null>(null);
  function fit() {
    const img = imgRef.current;
    if (!img || !img.complete || !img.naturalWidth) return;
    const w = img.clientWidth;
    const h = img.clientHeight;
    const prev = viewRef.current;
    if (!w || !h || (prev && w === prev.w && h === prev.h)) return;
    viewRef.current = { w, h };
    setView({ w, h });
    if (!prev) {
      const size = Math.round(Math.min(w, h) * 0.4);
      setBox({ x: Math.round((w - size) / 2), y: Math.round((h - size) / 3), size });
    } else {
      const k = w / prev.w;
      setBox((b) => (b ? { x: b.x * k, y: b.y * k, size: b.size * k } : b));
    }
  }
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(img);
    // 読み込み済みでも幅がまだ決まっていないときのために、少し後にもう一度
    const t = window.setTimeout(fit, 300);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, [url]);

  const minSize = view ? Math.max(40, Math.round(Math.min(view.w, view.h) * 0.1)) : 40;
  const maxSize = view ? Math.min(view.w, view.h) : 40;

  const clamp = (b: Box): Box => {
    if (!view) return b;
    const size = Math.max(minSize, Math.min(b.size, maxSize));
    return {
      size,
      x: Math.min(Math.max(0, b.x), view.w - size),
      y: Math.min(Math.max(0, b.y), view.h - size),
    };
  };

  // 指を置いた場所で動きを決める：右下の丸＝大きさ、枠の中＝移動、枠の外＝そこへ枠を移して、そのまま動かせる
  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if (!box || drag.current) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const onHandle = (e.target as Element).closest(".face-picker-handle") || Math.hypot(px - (box.x + box.size), py - (box.y + box.size)) <= 26;
    let start = box;
    let mode: "move" | "resize" = "move";
    if (onHandle) mode = "resize";
    else if (px < box.x || px > box.x + box.size || py < box.y || py > box.y + box.size) {
      start = clamp({ ...box, x: px - box.size / 2, y: py - box.size / 2 });
      setBox(start);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, id: e.pointerId, startX: e.clientX, startY: e.clientY, start };
  }

  function move(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.mode === "move") setBox(clamp({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }));
    else setBox(clamp({ ...d.start, size: d.start.size + (Math.abs(dx) > Math.abs(dy) ? dx : dy) }));
  }

  function up(e: ReactPointerEvent) {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }

  // スライダーで大きさを変える（顔の中心はそのまま）
  function resizeTo(size: number) {
    if (!box) return;
    const cx = box.x + box.size / 2;
    const cy = box.y + box.size / 2;
    setBox(clamp({ size, x: cx - size / 2, y: cy - size / 2 }));
  }

  async function crop(whole: boolean) {
    if (!view || !box) return;
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const k = bitmap.width / view.w; // 表示ピクセル → 元の写真のピクセル
      let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
      let face: Face | null = null;
      if (!whole) {
        const side = Math.min(box.size * MARGIN * k, bitmap.width, bitmap.height);
        const cx = (box.x + box.size / 2) * k;
        // 顔より下（肩や服）を多めに入れる
        const cy = (box.y + box.size * 0.65) * k;
        sw = sh = side;
        sx = Math.min(Math.max(0, cx - side / 2), bitmap.width - side);
        sy = Math.min(Math.max(0, cy - side / 2), bitmap.height - side);
        face = {
          x: Math.max(0, (box.x * k - sx) / side),
          y: Math.max(0, (box.y * k - sy) / side),
          w: Math.min(1, (box.size * k) / side),
          h: Math.min(1, (box.size * k) / side),
        };
        face.w = Math.min(face.w, 1 - face.x);
        face.h = Math.min(face.h, 1 - face.y);
      }
      const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sw * scale);
      canvas.height = Math.round(sh * scale);
      canvas.getContext("2d")!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
      if (!blob) throw new Error("crop failed");
      onDone(new File([blob], "photo.jpg", { type: "image/jpeg" }), face);
    } catch (e) {
      console.error("face crop failed", e);
      onError();
    }
  }

  // ページの中の項目は動き（translate）が付いていて、その中だと画面全体に広がらないので、body の直下に出す
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${title}の顔をえらぶ`} className="face-picker">
      <div className="face-picker-inner">
        <div className="display" style={{ fontSize: 18, fontWeight: 900, color: "var(--navy)" }}>{title}の顔を囲んでください</div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--sub)" }}>
          何人か写っている写真は、登場させたい人の顔に枠を合わせてください。顔をタップすると枠がそこへ移り、そのまま指で動かせます。大きさは下のスライダーか、枠の右下の丸で変えられます。
        </p>
        <div
          className="face-picker-stage"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 選んだ写真のその場プレビュー */}
          <img ref={imgRef} src={url} alt="選んだ写真" onLoad={fit} onError={onError} draggable={false} />
          {box && (
            <div className="face-picker-box" style={{ left: box.x, top: box.y, width: box.size, height: box.size }}>
              <span className="face-picker-handle" aria-hidden="true" />
            </div>
          )}
        </div>
        {box && view && (
          <label className="face-picker-size">
            <span>枠の大きさ</span>
            <input
              type="range"
              min={minSize}
              max={maxSize}
              step={1}
              value={Math.round(box.size)}
              onChange={(e) => resizeTo(Number(e.target.value))}
              aria-label="枠の大きさ"
            />
          </label>
        )}
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
    </div>,
    document.body,
  );
}
