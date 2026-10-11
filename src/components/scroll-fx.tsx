"use client";

import { useEffect } from "react";

/**
 * スクロールして見えてきた要素を、ふわっと出す（2026-10-11 作道さん「スクロール後もワクワク感を」）。
 * 動かしたい要素に data-reveal="up | pop | left | right" を付ける。data-d に数字を入れると、その分だけ遅れて出る（並んだカードを順番に出す）。
 * JS が動かないときや、動きを減らす設定の人には何もしない（最初から全部見えている）。
 */
export function ScrollFx() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const show = (el: HTMLElement) => el.setAttribute("data-shown", "");
    // 開いた時点で画面に入っているものは、隠さずそのまま（ちらつかないように）
    for (const el of items) {
      if (el.getBoundingClientRect().top < window.innerHeight) show(el);
      const d = Number(el.dataset.d ?? 0);
      if (d) el.style.transitionDelay = `${d * 90}ms`;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          show(e.target as HTMLElement);
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    items.filter((el) => !el.hasAttribute("data-shown")).forEach((el) => io.observe(el));
    document.documentElement.classList.add("fx");
    return () => {
      io.disconnect();
      document.documentElement.classList.remove("fx");
    };
  }, []);
  return null;
}
