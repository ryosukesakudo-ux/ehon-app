"use client";

import { useRef, useState } from "react";
import { BookCover } from "@/components/book-cover";
import { SampleImage } from "@/components/sample-image";
import s from "./top.module.css";

export type TopBookPage = { url: string | null; text: string };

// トップの「中身をのぞいてみる」：見本の絵本（表紙＋最初の数ページ）を横にめくって読める（2026-10-13 作道さん、TaleCoco との比較から）
export function TopBook({ lead, title, cover, pages }: { lead: string; title: string; cover: string | null; pages: TopBookPage[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const total = pages.length + 1;

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(total - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className={s.flip}>
      <div
        ref={track}
        className={s.flipTrack}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(e.currentTarget.clientWidth, 1)))}
        aria-label="見本の絵本"
      >
        <div className={s.flipPage}>
          <BookCover lead={lead} title={title} art={<SampleImage src={cover} alt="見本の絵本の表紙" sizes="(max-width: 480px) 100vw, 440px" fallback={<span className={s.galleryFallback}>[表紙]</span>} />} />
        </div>
        {pages.map((p, i) => (
          <div key={i} className={s.flipPage}>
            <div className={s.flipArt}>
              <SampleImage src={p.url} alt={`見本の絵本 ${i + 1}ページ目の絵`} sizes="(max-width: 480px) 100vw, 440px" fallback={<span className={s.galleryFallback}>[見本の絵]</span>} />
            </div>
            <p className={s.flipText}>{p.text}</p>
          </div>
        ))}
      </div>
      <div className={s.flipNav}>
        <button type="button" className={s.flipBtn} onClick={() => go(index - 1)} disabled={index === 0} aria-label="前のページ">
          ‹
        </button>
        <span className="display" style={{ fontSize: 14, color: "var(--navy)" }}>
          {index + 1} / {total}
        </span>
        <button type="button" className={s.flipBtn} onClick={() => go(index + 1)} disabled={index === total - 1} aria-label="次のページ">
          ›
        </button>
      </div>
    </div>
  );
}
