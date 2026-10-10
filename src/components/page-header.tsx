import Link from "next/link";
import { Sparkle, Star } from "./icons";
import { Brand } from "./brand";

/** ログイン・会員ページなど、注文フロー以外の画面の上部 */
export function PageHeader({ title }: { title: string }) {
  return (
    <header className="step-header" style={{ paddingBottom: 22 }}>
      <Star size={14} style={{ position: "absolute", right: 70, top: 10 }} />
      <Sparkle size={12} style={{ position: "absolute", left: 120, top: 44 }} />
      <div className="step-header-row">
        <Link href="/" style={{ textDecoration: "none" }}>
          <Brand size={32} />
        </Link>
      </div>
      <h1 className="step-title display" style={{ fontSize: 23 }}>{title}</h1>
    </header>
  );
}
