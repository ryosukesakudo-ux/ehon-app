"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Arrow, Chevron, Sparkle, Star } from "@/components/icons";
import { useFlow } from "./flow";
import { useAccount } from "./account";

export const TOTAL_STEPS = 6;

export function StepHeader({ step, back }: { step: number; back?: string }) {
  return (
    <header className="step-header">
      <Star size={14} style={{ position: "absolute", left: "58%", top: 6 }} />
      <Sparkle size={12} style={{ position: "absolute", left: 90, top: 40 }} />
      <div className="step-header-row">
        {back ? (
          <Link href={back} className="icon-link" aria-label="戻る">
            <Chevron />
          </Link>
        ) : (
          <Link href="/" className="icon-link" aria-label="トップへ">
            <Chevron />
          </Link>
        )}
        <div className="display" style={{ fontSize: 16, fontWeight: 900, color: "var(--navy)" }}>
          わたしの絵本
        </div>
        <SaveAndExit />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="progress" style={{ flex: 1 }} role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL_STEPS} aria-valuenow={step} aria-label="進み具合">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <span key={i} className={i < step ? "on" : ""} />
          ))}
        </div>
        <div className="display" style={{ fontSize: 13, fontWeight: 800, color: "var(--navy)" }}>
          {step}/{TOTAL_STEPS}
        </div>
      </div>
    </header>
  );
}

/** 会員だけに出す「保存してマイページへ」。入力途中の内容をアカウントに保存してから移動する。 */
function SaveAndExit() {
  const [account] = useAccount();
  const { state } = useFlow();
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!account?.loggedIn) return <div style={{ width: 44 }} />;

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/flow-save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...state, path: pathname }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "下書きを保存できませんでした");
      router.push("/account?saved=1");
    } catch (e) {
      setBusy(false);
      alert(e instanceof Error ? e.message : "下書きを保存できませんでした");
    }
  }

  return (
    <button type="button" className="header-pill display" onClick={save} disabled={busy}>
      {busy ? "保存中…" : "保存してマイページへ"}
    </button>
  );
}

export function StepTitle({ title, lead }: { title: string; lead: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h1 className="step-title display">{title}</h1>
      <p className="step-lead">{lead}</p>
    </div>
  );
}

export function NextButton({
  children,
  onClick,
  href,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  return (
    <div className="step-footer">
      {href && !disabled ? (
        <Link href={href} className="cta">
          {children}
          <Arrow />
        </Link>
      ) : (
        <button type="button" className="cta" onClick={onClick} disabled={disabled}>
          {children}
          <Arrow />
        </button>
      )}
    </div>
  );
}
