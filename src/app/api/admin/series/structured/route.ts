import { revalidatePath } from "next/cache";
import { SERIES_DATA, type SeriesData, type SeriesVersion } from "@/lib/series-data";
import { isStructured, writeStructuredEdit } from "@/lib/script-edits";
import type { Combo, SeriesId } from "@/lib/story-key";

// 台本まるごとを直す（/admin/series/script の、ヒーロー・プリンセス）。data が null なら元の台本（JSON）に戻す。
// 形（話・場面の数、写真の組み合わせの版、服の形と色の id）は元の台本と同じでないと保存しない
// （注文の番号 hero:1:n:none:wcape-red などが、直したあとも同じ服・場面を指すように）。

const TEXT_MAX = 600;
const PROMPT_MAX = 3000;
const COMBOS: Combo[] = ["both", "mom", "dad", "none"];

const str = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const optStr = (v: unknown, max: number) => v === undefined || (typeof v === "string" && v.length <= max);

function versionOk(v: SeriesVersion | undefined, base: SeriesVersion) {
  return (
    !!v &&
    str(v.label, 300) &&
    str(v.art, PROMPT_MAX) &&
    optStr(v.camera, PROMPT_MAX) &&
    Array.isArray(v.text) &&
    v.text.length === base.text.length &&
    v.text.every((t) => str(t, TEXT_MAX)) &&
    typeof v.withSidekick === "boolean" &&
    // ママ・パパが出るかどうかは写真の組み合わせで決まっているので、変えられない
    v.withMom === base.withMom &&
    v.withDad === base.withDad
  );
}

/** 直した台本が、元の台本と同じ形で、文や指示が空でないか。だめなら理由を返す */
function check(data: SeriesData, base: SeriesData): string | null {
  if (data?.id !== base.id) return "シリーズが違います";
  if (!str(data.sidekick, PROMPT_MAX) || !str(data.sidekickLabel, 100)) return "相棒の説明が空です";
  for (const [k, v] of [...Object.entries(data.cast ?? {}), ...Object.entries(data.props ?? {})]) {
    if (!str(k, 60) || !str(v, PROMPT_MAX)) return "登場人物・物の名前か説明が空です";
  }
  if (!optStr(data.style, PROMPT_MAX) || !optStr(data.castRules, PROMPT_MAX)) return "タッチか決まりが長すぎます";
  const oc = data.outfitChoices;
  const boc = base.outfitChoices;
  if (!!oc !== !!boc) return "服の選択肢の形が違います";
  if (oc && boc) {
    if (!str(oc.label, 30) || oc.types.length !== boc.types.length) return "服の形の数は変えられません";
    for (const [i, t] of oc.types.entries()) {
      const b = boc.types[i];
      if (t.id !== b.id || t.colors.length !== b.colors.length) return "服の形・色の数は変えられません";
      if (!str(t.name, 20) || !str(t.note, 60) || !str(t.look, PROMPT_MAX) || !t.look.includes("{color}")) return `服「${t.name || b.name}」の名前・説明・絵の指示（{color} を入れる）を確かめてください`;
      for (const [j, c] of t.colors.entries()) {
        if (c.id !== b.colors[j].id) return "色の id は変えられません";
        if (!str(c.name, 20) || !str(c.look, 300) || !/^#[0-9a-fA-F]{6}$/.test(c.swatch)) return `色「${c.name || b.colors[j].name}」の名前・色見本・絵の指示を確かめてください`;
      }
    }
  }
  if (data.episodes?.length !== base.episodes.length) return "話の数は変えられません";
  for (const [i, ep] of data.episodes.entries()) {
    const b = base.episodes[i];
    if (ep.no !== b.no || ep.scenes?.length !== b.scenes.length) return "場面の数は変えられません";
    if (b.outfits && (!str(ep.outfits, PROMPT_MAX) || (oc && !ep.outfits!.includes("{outfit}")))) return "その話の服装（{outfit} を入れる）を確かめてください";
    for (const c of ep.continuity ?? []) {
      if (!str(c.text, PROMPT_MAX) || (c.from !== undefined && !Number.isInteger(c.from)) || (c.to !== undefined && !Number.isInteger(c.to))) return "絵をそろえる決まりを確かめてください";
    }
    if (!str(ep.cover?.label, 300) || !str(ep.cover?.art, PROMPT_MAX) || !optStr(ep.cover?.camera, PROMPT_MAX) || typeof ep.cover?.withSidekick !== "boolean") return "表紙の説明が空です";
    for (const [j, sc] of ep.scenes.entries()) {
      const bs = b.scenes[j];
      if (!versionOk(sc, bs)) return `場面${j + 1}の文・絵の説明を確かめてください（空の欄があるか、長すぎます）`;
      for (const c of COMBOS) {
        if (!!sc.alt?.[c] !== !!bs.alt?.[c]) return `場面${j + 1}の写真の組み合わせの版は増やしたり消したりできません`;
        if (bs.alt?.[c] && !versionOk(sc.alt![c], bs.alt[c]!)) return `場面${j + 1}（写真の組み合わせ別）の文・絵の説明を確かめてください`;
      }
    }
  }
  return null;
}

/** 管理画面から来た台本を、保存する形（知らない項目を落とす）に整える */
function clean(data: SeriesData, base: SeriesData): SeriesData {
  const version = (v: SeriesVersion) => ({
    label: v.label.trim(),
    art: v.art.trim(),
    text: v.text.map((t) => t.replace(/\r\n?/g, "\n").trim()),
    withMom: v.withMom,
    withDad: v.withDad,
    withSidekick: v.withSidekick,
    ...(v.camera?.trim() && { camera: v.camera.trim() }),
  });
  return {
    ...base,
    name: base.name,
    sidekick: data.sidekick.trim(),
    sidekickLabel: data.sidekickLabel.trim(),
    cast: Object.fromEntries(Object.entries(data.cast ?? {}).map(([k, v]) => [k.trim(), v.trim()])),
    props: Object.fromEntries(Object.entries(data.props ?? {}).map(([k, v]) => [k.trim(), v.trim()])),
    ...(data.style?.trim() ? { style: data.style.trim() } : { style: undefined }),
    ...(data.castRules?.trim() ? { castRules: data.castRules.trim() } : { castRules: undefined }),
    ...(data.outfitChoices && {
      outfitChoices: {
        label: data.outfitChoices.label.trim(),
        types: data.outfitChoices.types.map((t) => ({
          id: t.id,
          name: t.name.trim(),
          note: t.note.trim(),
          look: t.look.trim(),
          colors: t.colors.map((c) => ({ id: c.id, name: c.name.trim(), swatch: c.swatch, look: c.look.trim() })),
        })),
      },
    }),
    episodes: data.episodes.map((ep, i) => ({
      ...base.episodes[i],
      // 題名はお話選び・表紙の題名（story-key.ts の SERIES_LIST）と同じにしておくため、ここでは変えない
      title: base.episodes[i].title,
      outfits: ep.outfits?.trim() || base.episodes[i].outfits,
      continuity: (ep.continuity ?? []).map((c) => ({ ...(c.from !== undefined && { from: c.from }), ...(c.to !== undefined && { to: c.to }), text: c.text.trim() })),
      cover: { label: ep.cover.label.trim(), art: ep.cover.art.trim(), withSidekick: ep.cover.withSidekick, ...(ep.cover.camera?.trim() && { camera: ep.cover.camera.trim() }) },
      scenes: ep.scenes.map((sc, j) => ({
        ...version(sc),
        ...(base.episodes[i].scenes[j].counts && { counts: base.episodes[i].scenes[j].counts }),
        ...(sc.alt && { alt: Object.fromEntries(COMBOS.filter((c) => sc.alt![c]).map((c) => [c, version(sc.alt![c]!)])) }),
      })),
    })),
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const id = String(body?.series ?? "") as SeriesId;
  const base = SERIES_DATA[id];
  if (!base || !isStructured(id)) return Response.json({ error: "指定が正しくありません" }, { status: 400 });
  let data: SeriesData | null = null;
  if (body?.data !== null) {
    let reason: string | null;
    try {
      reason = check(body?.data, base);
    } catch {
      reason = "台本の形が正しくありません";
    }
    if (reason) return Response.json({ error: reason }, { status: 400 });
    data = clean(body.data, base);
  }
  try {
    await writeStructuredEdit(id, data);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "保存できませんでした" }, { status: 500 });
  }
  revalidatePath("/");
  revalidatePath("/samples");
  return Response.json({ ok: true, data: data ?? base });
}
