import { getFlowSave, parseFlowSave, putFlowSave } from "@/lib/flow-save";

// 作成途中の下書き（会員のみ）。作成画面の「保存して中断」と、マイページの「つづきから」で使う。
export async function GET() {
  return Response.json({ save: await getFlowSave() });
}

export async function POST(request: Request) {
  const save = parseFlowSave(await request.json().catch(() => null));
  if (!save) return Response.json({ error: "保存する内容が正しくありません" }, { status: 400 });
  try {
    if (!(await putFlowSave(save))) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  } catch (e) {
    console.error("flow save failed", e);
    return Response.json({ error: "下書きを保存できませんでした" }, { status: 500 });
  }
  return Response.json({ ok: true });
}

// ?draft=ID を付けたときは、その下書きを保存しているときだけ消す（注文が終わった絵本の分だけ消すため）
export async function DELETE(request: Request) {
  const draft = new URL(request.url).searchParams.get("draft");
  const current = await getFlowSave();
  if (!current) return Response.json({ ok: true });
  if (draft && current.draftId !== draft) return Response.json({ ok: true });
  try {
    await putFlowSave(null);
  } catch (e) {
    console.error("flow save delete failed", e);
    return Response.json({ error: "下書きを消せませんでした" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
