import { redirect } from "next/navigation";

// 旧キャラスタジオ → スタジオに統合（2026-10-19）
export default function OldCharactersPage() {
  redirect("/admin/studio");
}
