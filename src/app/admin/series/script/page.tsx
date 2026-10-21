import { SERIES_DATA } from "@/lib/series-data";
import { readScriptEdits, scriptEditKey, variantFor, type ScriptVariant } from "@/lib/script-edits";
import { SHOWN_SERIES_LIST, openEpisodes, type Combo, type SeriesId } from "@/lib/story-key";
import { ScriptEditor, type ScriptSeries } from "./editor";

// 台本の本文を直す（2026-10-21 作道さん「台本も修正できるようにしたい」）。
// 直した文は script-edits.ts で台本に重ね、お客様の本・トップ・サンプル集・絵スタジオの文にそのまま効く。
export const dynamic = "force-dynamic";

const COMBOS: Combo[] = ["both", "mom", "dad", "none"];

export default async function ScriptPage({ searchParams }: { searchParams: Promise<{ series?: string; ep?: string }> }) {
  const q = await searchParams;
  const edits = await readScriptEdits();
  const list: ScriptSeries[] = SHOWN_SERIES_LIST.map((info) => {
    const data = SERIES_DATA[info.id];
    return {
      id: info.id,
      name: data.name,
      // 数のお勉強は文が1種類だけ（3つとも同じ文）
      single: info.id === "number",
      episodes: openEpisodes(data.episodes).map((ep) => ({
        no: ep.no,
        title: ep.title,
        scenes: ep.scenes.map((sc, i) => {
          // 写真の組み合わせごとに、どの版の文を使うか（同じ版を使う組み合わせはまとめる）
          const variants: ScriptVariant[] = [];
          const combosOf: Partial<Record<ScriptVariant, Combo[]>> = {};
          for (const c of COMBOS) {
            const v = variantFor(sc, c);
            if (!combosOf[v]) variants.push(v);
            (combosOf[v] ??= []).push(c);
          }
          return {
            versions: variants.map((v) => {
              const base = v === "main" ? sc : sc.alt![v]!;
              const e = edits[scriptEditKey(info.id, ep.no, i + 1, v)];
              return { variant: v, combos: combosOf[v]!, label: base.label, base: base.text, text: e ? base.text.map((t, l) => e.text[l] ?? t) : base.text, updatedAt: e?.updatedAt ?? null };
            }),
          };
        }),
      })),
    };
  });
  const series = list.find((s) => s.id === q.series)?.id ?? list[0].id;
  const ep = Number(q.ep) || 1;
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 16 }}>
      <a href="/admin/series">← 台本の絵スタジオへ</a>
      <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>台本の文を直す</h1>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8 }}>
        各場面の本文を、文の量（少ない・普通・多い）ごとに直して「保存」します。保存するとすぐ、お客様の本（プレビュー・印刷・しまうま用の画像）、トップとサンプル集の見本の文、絵スタジオの見開きの文に使われます（注文済みでまだ印刷していない本も、新しい文になります）。
        「{"{name}"}」の所には主人公の名前が入ります。「多い」は 漢字《かな》 の形でふりがなを付けます。改行はそのまま本の改行になります。
        ママ・パパの写真の組み合わせで文が違う場面は、組み合わせごとに直せます。「元の台本に戻す」で直す前の文に戻せます。
      </p>
      <ScriptEditor list={list} initialSeries={series as SeriesId} initialEpisode={ep} />
    </main>
  );
}
