"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Arrow, Chevron, Sparkle, Star } from "@/components/icons";

export const TOTAL_STEPS = 6;

export function StepHeader({ step, back }: { step: number; back?: string }) {
  return (
    <header className="step-header">
      <Star size={14} style={{ position: "absolute", right: 70, top: 8 }} />
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
        <div className="display" style={{ width: 44, textAlign: "right", fontSize: 13, fontWeight: 800, color: "var(--navy)" }}>
          {step}/{TOTAL_STEPS}
        </div>
      </div>
      <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL_STEPS} aria-valuenow={step} aria-label="進み具合">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span key={i} className={i < step ? "on" : ""} />
        ))}
      </div>
    </header>
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
