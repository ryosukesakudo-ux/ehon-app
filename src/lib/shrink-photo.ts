// スマホの写真は大きいので、送る前にブラウザで縮小する（サーバーの受け取り上限は約4.5MB）
export async function shrinkPhoto(file: File, maxEdge = 1600): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  if (!blob) throw new Error("写真を読み込めませんでした。別の写真をお試しください");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}
