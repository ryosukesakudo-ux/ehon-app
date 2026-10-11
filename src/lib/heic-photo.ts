// iPhone の写真（HEIC）は、Chrome など多くのブラウザでそのまま表示できない。
// 選んだときにブラウザの中で JPEG に変換してから使う（変換ライブラリは HEIC のときだけ読み込む）。
const HEIC = /\.(heic|heif)$/i;

export function looksHeic(file: File) {
  return /image\/hei[cf]/i.test(file.type) || HEIC.test(file.name);
}

export async function toViewablePhoto(file: File): Promise<File> {
  if (!looksHeic(file)) return file;
  const { heicTo } = await import("heic-to/next");
  const blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
  return new File([blob], file.name.replace(HEIC, ".jpg"), { type: "image/jpeg" });
}
