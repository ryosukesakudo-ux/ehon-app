"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Arrow, Chevron, Sparkle, Star } from "@/components/icons";
import { useFlow } from "./flow";
import { useAccount } from "./account";
import { Brand } from "@/components/brand";

export const TOTAL_STEPS = 6;

/** 進み具合の各ステップの名前（ヘッダーの丸の下に出す） */
const STEP_LABELS = ["タッチ", "お話", "写真", "見本", "サイズ", "注文"];

/**
 * 進み具合：丸と線でつないだステップ。今のステップの丸がぽんと大きくなり、線が前のステップから伸びる
 * （2026-10-13 作道さん：ステップが進んでいく見せ方を華やかに）
 */
function Stepper({ step, onStep, reachable = 0 }: { step: number; onStep?: (n: number) => void; reachable?: number }) {
  const pct = (n: number) => `${(Math.max(0, n - 1) / (TOTAL_STEPS - 1)) * 100}%`;
  return (
    <div className="flow-steps" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL_STEPS} aria-valuenow={step} aria-label={`進み具合 ${step}/${TOTAL_STEPS}：${STEP_LABELS[step - 1]}`}>
      <div className="flow-steps-track" aria-hidden="true">
        <div className="flow-steps-fill" style={{ ["--from" as string]: pct(step - 1), ["--to" as string]: pct(step) }} />
      </div>
      <ol className="flow-steps-dots" aria-hidden={onStep ? undefined : true}>
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "now" : "";
          const inner = (
            <>
              <span className="flow-steps-dot display">{n < step ? "✓" : n}</span>
              <span className="flow-steps-label display">{label}</span>
            </>
          );
          return (
            <li key={label} className={state} style={{ ["--d" as string]: `${i * 40}ms` }}>
              {/* 1ページの作成画面では、出ている項目の丸を押すとその項目へ戻れる（2026-10-14 作道さん） */}
              {onStep && n <= reachable ? (
                <button type="button" className="flow-steps-jump" onClick={() => onStep(n)} aria-label={`${label}へ戻る`}>
                  {inner}
                </button>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** trackPath=false：開いている画面の記録は呼び出し側で行う（1ページの作成画面）。sticky：スクロールしても上に残す */
export function StepHeader({
  step,
  back,
  trackPath = true,
  sticky = false,
  onStep,
  reachable,
}: {
  step: number;
  back?: string;
  trackPath?: boolean;
  sticky?: boolean;
  /** 丸を押したとき（1ページの作成画面で、その項目へ戻る）。reachable までのステップだけ押せる */
  onStep?: (n: number) => void;
  reachable?: number;
}) {
  const { update, ready } = useFlow();
  const pathname = usePathname();
  // 最後に開いていた画面を覚えておく（ログイン後やマイページから、この画面に戻れるように）
  useEffect(() => {
    if (ready && trackPath) update({ path: pathname });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 画面が変わったときだけ記録する
  }, [ready, pathname]);
  return (
    <header className={sticky ? "step-header sticky" : "step-header"}>
      <Star size={14} className="twinkle" style={{ position: "absolute", left: "58%", top: 6 }} />
      <Sparkle size={12} className="twinkle" style={{ position: "absolute", left: 90, top: 40, animationDelay: "1.2s" }} />
      <div className="step-header-row">
        {back ? (
          <Link href={back} className="back-link display">
            <Chevron size={18} />
            戻る
          </Link>
        ) : (
          <Link href="/" className="back-link display">
            <Chevron size={18} />
            トップ
          </Link>
        )}
        <Brand size={26} mark={false} />
        <SaveAndExit />
      </div>
      <Stepper step={step} onStep={onStep} reachable={reachable} />
    </header>
  );
}

/** 会員だけに出す「保存して中断」。入力途中の内容をアカウントに保存してから移動する。 */
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
      {busy ? "保存中…" : "保存して中断"}
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
