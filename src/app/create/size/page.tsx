"use client";

import { EXTRA_COPY_DISCOUNT, MAX_COPIES, SIZES, extraCopyPrice, getSize, orderTotal, yen } from "@/lib/catalog";
import { useFlow } from "../flow";
import { NextButton, StepHeader, StepTitle } from "../step";

export default function SizePage() {
  const { state, update } = useFlow();
  const size = getSize(state.size)!;
  return (
    <>
      <StepHeader step={5} back="/create/preview" />
      <main className="step-body">
        <StepTitle title="サイズを選んでください" lead="価格は送料・税込です。" />
        {SIZES.map((s) => (
          <button key={s.id} type="button" className="choice" aria-pressed={state.size === s.id} onClick={() => update({ size: s.id })} style={{ padding: 16 }}>
            <div className="display" style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 12, background: "#F3F6FB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: "var(--blue)" }}>
              {s.name}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flexGrow: 1 }}>
              {s.popular && <div className="tag" style={{ alignSelf: "flex-start" }}>いちばん人気</div>}
              <div className="choice-desc">{s.spec}</div>
              <div className="display" style={{ fontSize: 21, fontWeight: 900 }}>{yen(s.price)}</div>
            </div>
          </button>
        ))}
        <div className="card" style={{ padding: 18, gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div className="display" style={{ fontSize: 15, fontWeight: 800, color: "var(--navy)" }}>部数</div>
            <div className="stepper" role="group" aria-label="部数">
              <button type="button" className="stepper-btn" aria-label="1冊へらす" disabled={state.copies <= 1} onClick={() => update({ copies: state.copies - 1 })}>−</button>
              <span className="stepper-value display" aria-live="polite">{state.copies}冊</span>
              <button type="button" className="stepper-btn" aria-label="1冊ふやす" disabled={state.copies >= MAX_COPIES} onClick={() => update({ copies: state.copies + 1 })}>＋</button>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--sub)" }}>
            おじいちゃん・おばあちゃん用などに。2冊目からは1冊{yen(EXTRA_COPY_DISCOUNT)}引きの{yen(extraCopyPrice(state.size))}で、同じ箱でお届けします（{MAX_COPIES}冊まで）。
          </p>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="sum-row"><span>絵本（{size.name}サイズ）</span><span>{yen(size.price)}</span></div>
          {state.copies > 1 && <div className="sum-row"><span>追加の{state.copies - 1}冊（{yen(extraCopyPrice(state.size))}×{state.copies - 1}）</span><span>{yen(extraCopyPrice(state.size) * (state.copies - 1))}</span></div>}
          <div className="sum-row"><span>送料</span><span>0円</span></div>
          <div className="divider" />
          <div className="sum-total">
            <span className="display" style={{ fontSize: 15, fontWeight: 800 }}>合計（税込）</span>
            <span className="display" style={{ fontSize: 28, fontWeight: 900, color: "var(--coral)" }}>{yen(orderTotal(state.size, state.copies))}</span>
          </div>
        </div>
      </main>
      <NextButton href="/create/checkout">注文内容の確認へ</NextButton>
    </>
  );
}
