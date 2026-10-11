// 写真のどこを顔として囲んだか（写真の幅・高さに対する割合 0〜1）。
// 何人か写っている写真で選んだ人が後から分かるように、囲んだ所以外をうすく暗くして見せる。
// サーバーでは写真のファイル名に入れて保存する（データベースの変更なしで、保存済みの写真でも分かるように）。
export type Face = { x: number; y: number; w: number; h: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** フォームで送る形（千分率をカンマ区切り） */
export function faceToField(face: Face): string {
  return [face.x, face.y, face.w, face.h].map((n) => Math.round(clamp01(n) * 1000)).join(",");
}

export function faceFromField(value: unknown): Face | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{1,4}),(\d{1,4}),(\d{1,4}),(\d{1,4})$/.exec(value);
  if (!m) return null;
  const [x, y, w, h] = m.slice(1).map((n) => Math.min(1000, Number(n)) / 1000);
  if (w <= 0 || h <= 0 || x + w > 1.001 || y + h > 1.001) return null;
  return { x, y, w, h };
}

/** 保存するファイル名に付ける印（例: ".f120-80-400-400"） */
export function faceToPathTag(face: Face | null): string {
  return face ? `.f${faceToField(face).replaceAll(",", "-")}` : "";
}

export function faceFromPath(path: string): Face | null {
  const m = /\.f(\d{1,4}-\d{1,4}-\d{1,4}-\d{1,4})\.\w+$/.exec(path);
  return m ? faceFromField(m[1].replaceAll("-", ",")) : null;
}
