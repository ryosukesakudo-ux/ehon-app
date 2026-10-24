import Image from "next/image";
import { photoPageFrames } from "@/lib/photo-layout";
import { SAMPLE_CHILD_NAME } from "@/lib/samples";
import s from "./top.module.css";

// トップの「最後のページはアルバムに」と思い出の写真のポップアップで出す、アルバムページの見本。
// 写真の大きさと並びは印刷（shimauma.ts）と同じ計算で出し、写真は切らずに枠へ収める（2026-10-24 作道さん）。
// 写真はAIで作った架空の家族（作道さんが用意した、場面のちがう4枚。縦と横がまざる並びも見せる）。
const PHOTOS = [
  { src: "/memory-sample.webp", w: 768, h: 512 },
  { src: "/memory-shichigosan.webp", w: 600, h: 900 },
  { src: "/memory-birthday.webp", w: 675, h: 900 },
  { src: "/memory-beach.webp", w: 900, h: 675 },
];
/** しまうま A5スクエア（148mm角）。見本では mm のまま計算して % にする */
const PAGE_MM = 148;
const FRAMES = photoPageFrames(PHOTOS.map((p) => p.w / p.h), PAGE_MM, (v) => v);
const pct = (v: number) => `${(v / PAGE_MM) * 100}%`;

export function AlbumSample({ reveal }: { reveal?: boolean }) {
  return (
    <div className={s.album} data-reveal={reveal ? "up" : undefined}>
      <div className={`${s.albumPage} ${s.albumPhotoPage}`}>
        {PHOTOS.map((p, i) => {
          const f = FRAMES[i];
          return (
            <div key={i} className={s.albumPhoto} style={{ left: pct(f.x), top: pct(PAGE_MM - f.y - f.h), width: pct(f.w), height: pct(f.h) }}>
              <Image src={p.src} alt="" width={p.w} height={p.h} sizes="120px" />
            </div>
          );
        })}
      </div>
      <div className={`${s.albumPage} ${s.albumMessage}`}>
        <div className={`${s.albumTo} display`}>{SAMPLE_CHILD_NAME}へ</div>
        <p>うまれてきてくれて ありがとう。<br />これからも たくさん わらってね。</p>
        <div className={s.albumFrom}>パパ・ママより</div>
        <div className={s.albumNo}>No.001</div>
      </div>
    </div>
  );
}
