import Link from "next/link";
import { BookIcon, Sparkle, Star } from "./icons";

/** ログイン・会員ページなど、注文フロー以外の画面の上部 */
export function PageHeader({ title }: { title: string }) {
  return (
    <header className="step-header" style={{ paddingBottom: 22 }}>
      <Star size={14} style={{ position: "absolute", right: 70, top: 10 }} />
      <Sparkle size={12} style={{ position: "absolute", left: 120, top: 44 }} />
      <div className="step-header-row">
        <Link href="/" className="display" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--navy)", fontSize: 16, fontWeight: 900, textDecoration: "none" }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--blue)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookIcon size={17} />
          </span>
          わたしの絵本
        </Link>
      </div>
      <h1 className="step-title display" style={{ fontSize: 23 }}>{title}</h1>
    </header>
  );
}
