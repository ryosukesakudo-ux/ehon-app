"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Arrow } from "@/components/icons";
import { SampleImage } from "@/components/sample-image";
import { DELIVERY_NOTE } from "@/lib/catalog";
import s from "./top.module.css";

// トップの「かんたん3ステップ」。カードを押すと、そのステップの説明をポップアップで出す（2026-10-14 作道さん）。
// ポップアップは作成画面のお話選びと同じ形（画面の内側に浮かせ、後ろのページが透けて見える）。

export type StepCardData = { color: string; shadow: string; title: string; desc: string };
export type StepDetails = {
  tastes: { name: string; img: string | null; points: string }[];
  stories: { name: string; open: boolean }[];
  showcasePhoto: string | null;
  showcaseBook: string | null;
  /** 3の見本：表紙と冒頭の2ページ（トップの見本の絵本と同じ） */
  preview: { cover: string | null; pages: (string | null)[] };
  sizes: { name: string; cover: string; price: string }[];
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
        <h2 id={`step-dialog-${step}`} className="display" style={{ margin: 0, fontSize: 19, fontWeight: 900, color: "var(--navy)" }}>{title}</h2>
        {children}
        {/* 閉じる（グレー）と つくってみる を下に横並び（2026-10-15 作道さん）。長い手順でも下に固定（シリーズのポップアップと同じ） */}
        <div className="dialog-footer">
          <button type="button" className="ghost gray" style={{ height: 54, padding: "0 16px", flexShrink: 0 }} onClick={onClose}>
            閉じる
          </button>
          <Link href="/create/taste" className="cta" style={{ height: 54, fontSize: 16, flex: 1, minWidth: 0, gap: 6 }}>
            絵本をつくってみる
            <Arrow size={18} />
          </Link>
        </div>
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
      {/* 左にアップする写真、右にできあがるイラスト（2026-10-15 作道さん） */}
      <div className={s.stepConvert}>
        <figure className={s.stepConvertItem}>
          <div className={s.stepConvertArt}>
            <SampleImage src={d.showcasePhoto} alt="アップする写真の例（見本）" fallback="[写真]" sizes="40vw" />
          </div>
          <figcaption>アップする写真</figcaption>
        </figure>
        <div className={s.stepConvertArrow} aria-hidden="true"><Arrow size={18} /></div>
        <figure className={s.stepConvertItem}>
          <div className={s.stepConvertArt}>
            <SampleImage src={d.showcaseBook} alt="写真から描いたイラスト（見本）" fallback="[イラスト]" sizes="40vw" />
          </div>
          <figcaption>できあがるイラスト</figcaption>
        </figure>
      </div>
      <div className={s.stepPhotoRow}>
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
      {/* 表紙と冒頭の2ページを重ねて、注文の前に見本を確かめられる感じを出す（2026-10-15 作道さん） */}
      <div className={s.stepStack} aria-label="見本のページの例">
        {d.preview.pages.slice(0, 2).map((url, i) => (
          <div key={i} className={`${s.stepStackPage} ${i === 0 ? s.stepStackPage1 : s.stepStackPage2}`}>
            <SampleImage src={url} alt={`見本の${i + 1}ページ目`} fallback="[見本]" sizes="40vw" />
          </div>
        ))}
        <div className={s.stepStackCover}>
          <SampleImage src={d.preview.cover} alt="見本の表紙" fallback="[表紙]" sizes="60vw" />
        </div>
        <span className={s.stepStackBadge}>見本でチェック</span>
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
      <p style={lead}>{DELIVERY_NOTE}</p>
    </>
  );
}
