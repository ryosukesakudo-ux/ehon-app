import { revalidatePath } from "next/cache";
import { SERIES_DATA } from "@/lib/series-data";
import { SCRIPT_TEXT_MAX, writeScriptEdit, type ScriptVariant } from "@/lib/script-edits";
import type { SeriesId } from "@/lib/story-key";

const VARIANTS: ScriptVariant[] = ["main", "both", "mom", "dad", "none"];

// 台本の本文を直す（/admin/series/script）。text は文の量（少ない・普通・多い）の3つ。null なら元の台本の文に戻す
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const id = String(body?.series ?? "") as SeriesId;
  const episode = Number(body?.episode);
  const scene = Number(body?.scene);
  const variant = String(body?.variant ?? "") as ScriptVariant;
  const ep = SERIES_DATA[id]?.episodes.find((e) => e.no === episode);
  if (!ep || !Number.isInteger(scene) || scene < 1 || scene > ep.scenes.length || !VARIANTS.includes(variant)) {
    return Response.json({ error: "指定が正しくありません" }, { status: 400 });
  }
  let text: string[] | null = null;
  if (body?.text !== null) {
    if (!Array.isArray(body?.text) || body.text.length !== 3 || body.text.some((t: unknown) => typeof t !== "string")) {
      return Response.json({ error: "文が正しくありません" }, { status: 400 });
    }
    text = (body.text as string[]).map((t) => t.replace(/\r\n?/g, "\n").trim());
    if (text.some((t) => !t)) return Response.json({ error: "空の文があります。文の量ごとにすべて書いてください" }, { status: 400 });
    if (text.some((t) => t.length > SCRIPT_TEXT_MAX)) return Response.json({ error: `文は${SCRIPT_TEXT_MAX}文字までです` }, { status: 400 });
  }
  try {
    await writeScriptEdit(id, episode, scene, variant, text);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "保存できませんでした" }, { status: 500 });
  }
  // トップとサンプル集の見本の文は、作っておいたページを次に開いたときに作り直す
  revalidatePath("/");
  revalidatePath("/samples");
  return Response.json({ ok: true });
}
