import { OnePageFlow } from "../one-page";

// タッチ・主人公・お話・写真は1ページ（one-page.tsx）。この URL から開くと「写真」の項目から始まる
export default function Page() {
  return <OnePageFlow start="photo" />;
}
