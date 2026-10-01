"use client";

import { EXTRA_COPY_PRICE, SIZES, getSize, orderTotal, yen } from "@/lib/catalog";
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
        <div className="card consent" style={{ fontSize: 14 }}>
          <input id="extra" type="checkbox" checked={state.extraCopy} onChange={(e) => update({ extraCopy: e.target.checked })} />
          <label htmlFor="extra">おじいちゃん・おばあちゃん用にもう1冊（Mサイズ・同梱）＋{yen(EXTRA_COPY_PRICE)}</label>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="sum-row"><span>絵本（{size.name}サイズ）</span><span>{yen(size.price)}</span></div>
          {state.extraCopy && <div className="sum-row"><span>追加の1冊</span><span>{yen(EXTRA_COPY_PRICE)}</span></div>}
          <div className="sum-row"><span>送料</span><span>0円</span></div>
          <div className="divider" />
          <div className="sum-total">
            <span className="display" style={{ fontSize: 15, fontWeight: 800 }}>合計（税込）</span>
            <span className="display" style={{ fontSize: 28, fontWeight: 900, color: "var(--coral)" }}>{yen(orderTotal(state.size, state.extraCopy))}</span>
          </div>
        </div>
      </main>
      <NextButton href="/create/checkout">注文内容の確認へ</NextButton>
    </>
  );
}
