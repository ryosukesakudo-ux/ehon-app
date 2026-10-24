import { OnePageFlow } from "../one-page";

// 主人公・お話・タッチ・写真は1ページ（one-page.tsx）。この URL がはじめ（主人公の項目から始まる）
export default function Page() {
  return <OnePageFlow start="profile" />;
}
