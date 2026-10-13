"use client";

import { useEffect, useState } from "react";
import { Lottie } from "@/components/lottie";
import { Sparkle, Star } from "@/components/icons";
import { EXTRA_COPY_DISCOUNT, yen } from "@/lib/catalog";

// 絵を作っている間の待ち画面（2026-10-13 作道さん：生成中の画面も華やかに）。
// 実際の進み具合はAIから受け取れないので、目安の時間に向かって少しずつ進むバーと、変わっていく一言で「いま描いている」感じを出す。

/** 目安の秒数。この時間で約9割まで進み、そのあとはゆっくり 97% に近づく */
const ESTIMATE_SECONDS = 60;
const MESSAGE_SECONDS = 4;

const TIPS = [
  "できあがった絵は、気になるところを選んで作り直せます",
  "名前は、表紙と本文のいろいろなページに入ります",
  "お支払いは、見本をぜんぶ見てからで大丈夫です",
  `2冊目からは1冊${yen(EXTRA_COPY_DISCOUNT)}引き。おじいちゃん・おばあちゃんにも`,
];

/**
 * name・what：絵の待ち画面（「〇〇のかおを かいています」など）。
 * title・messages・estimate を渡すと、お話づくりなど絵以外の待ち時間にも使える
 */
export function DrawingWait({
  name = "",
  what = "絵",
  title,
  messages: custom,
  estimate = ESTIMATE_SECONDS,
}: {
  name?: string;
  what?: string;
  title?: string;
  messages?: string[];
  estimate?: number;
}) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setSec((Date.now() - started) / 1000), 250);
    return () => window.clearInterval(timer);
  }, []);

  const who = name ? `${name}の` : "";
  const messages = custom ?? [
    "えのぐを まぜています",
    `${who}かおを かいています`,
    "いろを ぬっています",
    "ひかりと かげを つけています",
    "しあげの きらきらを かけています",
  ];
  // ひととおり出したら、最後の2つを交互に出す
  const step = Math.floor(sec / MESSAGE_SECONDS);
  const message = messages[step < messages.length ? step : messages.length - 2 + (step % 2)];
  const tip = TIPS[Math.floor(sec / (MESSAGE_SECONDS * 3)) % TIPS.length];
  // 指数的に近づく（止まって見えないよう、最後までわずかに動く）
  const progress = Math.min(97, 100 * (1 - Math.exp(-sec / (estimate / 2.3))));

  return (
    <div className="drawing-wait" role="status" aria-live="polite">
      <div className="drawing-wait-wash" aria-hidden="true" />
      <Star size={18} className="drawing-float" style={{ left: "12%", top: "16%" }} />
      <Sparkle size={16} color="#F6C445" className="drawing-float" style={{ right: "14%", top: "12%", animationDelay: "0.8s" }} />
      <Star size={14} color="#F08A6C" className="drawing-float" style={{ right: "20%", bottom: "28%", animationDelay: "1.6s" }} />
      <Sparkle size={14} color="#7CC7A8" className="drawing-float" style={{ left: "18%", bottom: "30%", animationDelay: "2.4s" }} />
      <Lottie name="drawing" style={{ width: 180, height: 135, position: "relative" }} />
      <div className="drawing-wait-what display">{title ?? `${what}を描いています`}</div>
      <div key={message} className="drawing-wait-msg display">{message}…</div>
      <div className="drawing-wait-bar" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="drawing-wait-time">{estimate >= 60 ? `${Math.round(estimate / 60)}分ほどかかります` : `${estimate}秒ほどかかります`}</div>
      <div key={tip} className="drawing-wait-tip">ヒント：{tip}</div>
    </div>
  );
}
