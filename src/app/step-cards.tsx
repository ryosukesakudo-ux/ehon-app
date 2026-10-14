"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Arrow } from "@/components/icons";
import { SampleImage } from "@/components/sample-image";
import s from "./top.module.css";

// トップの「かんたん3ステップ」。カードを押すと、そのステップの説明をポップアップで出す（2026-10-14 作道さん）。
// ポップアップは作成画面のお話選びと同じ形（画面の内側に浮かせ、後ろのページが透けて見える）。

export type StepCardData = { color: string; shadow: string; title: string; desc: string };
export type StepDetails = {
  tastes: { name: string; img: string | null; points: string }[];
  stories: { name: string; open: boolean }[];
  showcasePhoto: string | null;
  showcaseBook: string | null;
  sizes: { name: string; cover: string; price: string }[];
  deliveryDays: number;
  extraCopy: string;
};

export function StepCards({ steps, details }: { steps: StepCardData[]; details: StepDetails }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className={s.steps}>
        {steps.map((st, i) => (
          <button
            key={st.title}
            type="button"
            className={s.stepCard}
            style={{ boxShadow: `0 4px 0 ${st.shadow}` }}
            data-reveal="up"
            data-d={i}
            onClick={() => setOpen(i)}
            aria-haspopup="dialog"
          >
            <div className={`${s.stepNum} display`} style={{ background: st.color }}>{i + 1}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flexGrow: 1 }}>
              <div className={`${s.stepTitle} display`}>{st.title}</div>
              <div className={s.stepDesc}>{st.desc}</div>
              <div className={s.stepMore} style={{ color: st.color }}>くわしく ›</div>
            </div>
          </button>
        ))}
      </div>
      {open !== null && (
        <StepDialog step={open} title={`${open + 1}. ${steps[open].title}`} onClose={() => setOpen(null)}>
          {open === 0 && <TasteAndStory d={details} />}
          {open === 1 && <Photo d={details} />}
          {open === 2 && <Finish d={details} />}
        </StepDialog>
      )}
    </>
  );
}

function StepDialog({ step, title, onClose, children }: { step: number; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // 後ろの画面がスクロールしないように
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="story-dialog-backdrop" onClick={onClose}>
      <div className="story-dialog" role="dialog" aria-modal="true" aria-labelledby={`step-dialog-${step}`} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h2 id={`step-dialog-${step}`} className="display" style={{ margin: 0, fontSize: 19, fontWeight: 900, color: "var(--navy)" }}>{title}</h2>
          <button type="button" className="ghost" style={{ height: 36, padding: "0 14px", fontSize: 13, flexShrink: 0 }} onClick={onClose}>
            閉じる
          </button>
        </div>
        {children}
        <Link href="/create/taste" className="cta" style={{ height: 54, fontSize: 17 }}>
          絵本をつくってみる
          <Arrow size={20} />
        </Link>
      </div>
    </div>,
    document.body,
  );
}

const lead = { margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--sub)" } as const;
const sub = { margin: 0, fontSize: 15, fontWeight: 800, color: "var(--navy)" } as const;

function TasteAndStory({ d }: { d: StepDetails }) {
  return (
    <>
      <p style={lead}>絵のタッチは3種類。絵本ぜんぶが同じタッチで描かれます。</p>
      <div className={s.stepTastes}>
        {d.tastes.map((t) => (
          <div key={t.name} className={s.stepTaste}>
            <div className={s.stepTasteArt}>
              <SampleImage src={t.img} alt={`${t.name}の見本`} fallback="[見本]" sizes="33vw" />
            </div>
            <div className="display" style={{ fontSize: 13, fontWeight: 800, color: "var(--navy)" }}>{t.name}</div>
            <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--sub)" }}>{t.points}</div>
          </div>
        ))}
      </div>
      <p style={sub}>えらべるお話</p>
      <ul className={s.stepList}>
        {d.stories.map((st) => (
          <li key={st.name}>
            {st.name}
            {!st.open && <span className="soon" style={{ marginLeft: 6 }}>準備中</span>}
          </li>
        ))}
        <li>オリジナルストーリー（あらすじから作れます）</li>
      </ul>
    </>
  );
}

function Photo({ d }: { d: StepDetails }) {
  return (
    <>
      <p style={lead}>お子さまの写真1枚から作れます。ママやパパの写真も入れると、一緒に絵本に登場します。</p>
      <div className={s.stepPhotoRow}>
        <div className={s.stepPhotoArt}>
          <SampleImage src={d.showcasePhoto} alt="写真の例（見本）" fallback="[写真]" sizes="40vw" />
        </div>
        <ul className={s.stepList} style={{ flex: 1 }}>
          <li><b className={s.good}>○</b> 正面を向いている</li>
          <li><b className={s.good}>○</b> 明るく、顔がはっきり写っている</li>
          <li><b className={s.bad}>×</b> 横顔・うしろ向き</li>
          <li><b className={s.bad}>×</b> 暗い・ぼやけている</li>
        </ul>
      </div>
      <p style={lead}>何人か写っている写真でも、顔を囲んで選べます。写真は絵を作るためだけに使い、マイページからいつでも削除できます。</p>
    </>
  );
}

function Finish({ d }: { d: StepDetails }) {
  return (
    <>
      <p style={lead}>先に見本のページを作って確かめてから注文できます。気になる絵は作り直せます。</p>
      <div className={s.stepBookArt}>
        <SampleImage src={d.showcaseBook} alt="見本のページの例" fallback="[見本のページ]" sizes="(max-width: 640px) 90vw, 480px" />
      </div>
      <p style={sub}>お値段（送料込み）</p>
      <ul className={s.stepList}>
        {d.sizes.map((z) => (
          <li key={z.name}>
            {z.name}（{z.cover}）<b style={{ color: "var(--coral)", marginLeft: 6 }}>{z.price}</b>
          </li>
        ))}
        <li>2冊目からは1冊{d.extraCopy}引き</li>
      </ul>
      <p style={lead}>ご注文から{d.deliveryDays}日ほどでお届けします。</p>
    </>
  );
}
