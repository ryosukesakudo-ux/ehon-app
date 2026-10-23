"use client";

import { useEffect, useState } from "react";
import { Check } from "@/components/icons";
import { SampleImage } from "@/components/sample-image";
import { samplePublicUrl, versioned } from "@/lib/samples";
import { seriesOutfitPath } from "@/lib/series";
import { getSeriesInfo, parseSeriesKey, seriesKey, type SeriesId } from "@/lib/story-key";
import { useFlow } from "../flow";

type Choices = { id: string; name: string; note: string; colors: { id: string; name: string; swatch: string }[] }[];

/**
 * 服を選ぶお話（ヒーロー・プリンセス）の服選び（2026-10-23 作道さん）。お話を選んだ直後・写真の前に出す。
 * 形が3つ横に並び、形を選ぶとその形の色が3つ横に並ぶ。色を選ぶと、お話の番号に服を足して（:w形-色）次の項目（写真）へ。
 * 絵はAIが、その形・色の服を着たお子さまを描く
 */
export function OutfitSection({ onDecide }: { onDecide?: () => void }) {
  const { state, update } = useFlow();
  const k = parseSeriesKey(state.story);
  const info = k ? getSeriesInfo(k.series) : null;
  const [types, setTypes] = useState<Choices | null>(null);
  const [type, setType] = useState<string | null>(k?.outfit?.type ?? null);
  const series = k?.series;

  useEffect(() => {
    if (!series) return;
    fetch(`/api/series/outfits?series=${series}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setTypes(json?.types ?? []))
      .catch(() => setTypes([]));
  }, [series]);

  if (!k || !info?.outfitLabel) return null;
  if (types === null) return <p className="section-lead" style={{ margin: 0 }}>読み込んでいます…</p>;
  if (!types.length) return <p className="error">{info.outfitLabel}を読み込めませんでした。少しあとでもう一度お試しください。</p>;
  const picked = types.find((t) => t.id === type);

  const pickColor = (color: string) => {
    if (!picked) return;
    const same = k.outfit?.type === picked.id && k.outfit.color === color;
    if (!same) update({ story: seriesKey(k.series, k.episode, k.level, null, 0, { type: picked.id, color }), previews: {}, draftId: null });
    onDecide?.();
  };

  return (
    <>
      <div className="field">
        <span className="display" style={{ fontWeight: 800, color: "var(--navy)" }}>{info.outfitLabel}の形</span>
        <div className="level-row" role="radiogroup" aria-label={`${info.outfitLabel}の形`}>
          {types.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={type === t.id} className="choice outfit-choice" onClick={() => setType(t.id)}>
              <OutfitArt series={k.series} type={t.id} color={(k.outfit?.type === t.id ? k.outfit.color : null) ?? t.colors[0]?.id} swatch={t.colors[0]?.swatch} alt={t.name} />
              <span className="choice-title display">{t.name}</span>
              <span className="choice-desc" style={{ fontSize: 12 }}>{t.note}</span>
              {type === t.id && <div className="check outfit-check"><Check /></div>}
            </button>
          ))}
        </div>
      </div>
      {picked && (
        <div className="field">
          <span className="display" style={{ fontWeight: 800, color: "var(--navy)" }}>{picked.name}の色</span>
          <div className="level-row" role="radiogroup" aria-label={`${picked.name}の色`}>
            {picked.colors.map((c) => {
              const on = k.outfit?.type === picked.id && k.outfit.color === c.id;
              return (
                <button key={c.id} type="button" role="radio" aria-checked={on} className="choice outfit-choice" onClick={() => pickColor(c.id)}>
                  <OutfitArt series={k.series} type={picked.id} color={c.id} swatch={c.swatch} alt={`${picked.name}・${c.name}`} />
                  <span className="choice-title display" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: "50%", background: c.swatch, border: "1px solid rgba(0,0,0,0.15)" }} />
                    {c.name}
                  </span>
                  {on && <div className="check outfit-check"><Check /></div>}
                </button>
              );
            })}
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>写真をもとに、AIがこの{info.outfitLabel}を着たお子さまを描きます。</p>
        </div>
      )}
    </>
  );
}

/** 服の見本の絵（絵スタジオで作る）。まだ無いときは色見本の丸を出す */
function OutfitArt({ series, type, color, swatch, alt }: { series: SeriesId; type: string; color?: string; swatch?: string; alt: string }) {
  return (
    <div className="outfit-art" style={{ background: swatch ? `${swatch}33` : "#F3EFE8" }}>
      {color && (
        <SampleImage
          src={versioned(samplePublicUrl(seriesOutfitPath(series, type, color)))}
          alt={alt}
          fallback={<span aria-hidden="true" style={{ width: "46%", aspectRatio: "1 / 1", borderRadius: "50%", background: swatch ?? "#ddd" }} />}
          sizes="30vw"
        />
      )}
    </div>
  );
}
