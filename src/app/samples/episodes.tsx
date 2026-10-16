"use client";

import Link from "next/link";
import { useState } from "react";
import { Arrow } from "@/components/icons";
import { BookCover } from "@/components/book-cover";
import { SampleImage } from "@/components/sample-image";
import s from "./samples.module.css";

export type SampleEpisode = {
  no: number;
  title: string;
  season: string;
  lead: string;
  cover: string | null;
  /** 読めるページ（絵と文） */
  pages: { url: string | null; text: string }[];
  /** 続きのページの絵（ぼかして出す） */
  locked: (string | null)[];
};

/** サンプル集の話ごとの見本。タブで話を切り替える */
export function SampleEpisodes({ episodes }: { episodes: SampleEpisode[] }) {
  const [no, setNo] = useState(episodes[0]?.no ?? 1);
  const ep = episodes.find((e) => e.no === no) ?? episodes[0];
  if (!ep) return null;
  const total = ep.pages.length + ep.locked.length;

  return (
    <div className={s.episodes}>
      <div className={s.tabs} role="tablist" aria-label="お話">
        {episodes.map((e) => (
          <button
            key={e.no}
            type="button"
            role="tab"
            aria-selected={e.no === ep.no}
            className={`${s.tab} display`}
            onClick={() => setNo(e.no)}
          >
            <span style={{ fontSize: 15 }}>第{e.no}話</span>
            <span style={{ fontSize: 11 }}>{e.season}</span>
          </button>
        ))}
      </div>

      <div key={ep.no} className={s.book} role="tabpanel">
        <div className={s.cover}>
          <BookCover
            lead={ep.lead}
            title={ep.title}
            art={<SampleImage src={ep.cover} alt={`第${ep.no}話の表紙`} sizes="(max-width: 480px) 100vw, 440px" fallback={<span className={s.fallback}>準備中</span>} />}
          />
        </div>

        {ep.pages.map((p, i) => (
          <article key={i} className={s.spread}>
            <div className={s.picture}>
              {/* 見本の場面は横長（見開き）と、前に作った正方形がある。高さは絵の形に合わせる */}
              <SampleImage src={p.url} alt={`第${ep.no}話 ${i + 1}ページ目の絵`} sizes="(max-width: 480px) 100vw, 440px" style={{ height: "auto" }} fallback={<span className={s.fallback}>準備中</span>} />
            </div>
            <p className={s.text}>{p.text}</p>
            <div className={s.pageNo}>
              {i + 1} / {total}
            </div>
          </article>
        ))}

        <div className={s.locked}>
          <div className={s.lockedGrid} aria-hidden="true">
            {ep.locked.map((url, i) => (
              <div key={i} className={s.lockedThumb}>
                {/* 小さい画像だけを読み込んで、強くぼかす */}
                <SampleImage src={url} alt="" sizes="64px" fallback={null} />
              </div>
            ))}
          </div>
          <div className={s.lockedMessage}>
            <div className={s.lockIcon} aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </div>
            <div className="display" style={{ fontSize: 18, fontWeight: 900, color: "var(--navy)" }}>
              ここから先の{ep.locked.length}ページは
              <br />
              絵本が届いてからのお楽しみ
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--sub)" }}>お子さまが主人公になって、お話の続きを冒険します</div>
            <Link href="/create/taste" className="cta yellow" style={{ height: 54, fontSize: 17 }}>
              この絵本をつくる
              <Arrow />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
