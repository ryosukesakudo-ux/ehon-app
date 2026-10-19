import { redirect } from "next/navigation";

// 旧ショートスタジオ → スタジオに統合（2026-10-19）
export default function OldShortsPage() {
  redirect("/admin/studio");
}
