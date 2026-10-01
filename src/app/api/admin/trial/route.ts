import { toFile } from "openai";
import { getStory, getTaste, type StoryId, type TasteId } from "@/lib/catalog";
import { illustrate, type Person } from "@/lib/illustrate";

export const maxDuration = 300;

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

// 管理者用の試作。送られた写真で1場面の絵を作って返すだけで、写真も絵もサーバーには保存しない。
export async function POST(request: Request) {
  const form = await request.formData();
  const taste = String(form.get("taste") ?? "");
  const story = String(form.get("story") ?? "");
  const sceneIndex = Number(form.get("scene"));
  const quality = form.get("quality") === "final" ? "final" : "preview";
  const s = getStory(story);
  if (!getTaste(taste) || !s || !Number.isInteger(sceneIndex) || !s.scenes[sceneIndex]) {
    return Response.json({ error: "テイスト・お話・場面の指定が正しくありません" }, { status: 400 });
  }

  const images: { who: Person; file: Awaited<ReturnType<typeof toFile>> }[] = [];
  for (const who of ["child", "mom", "dad"] as const) {
    const f = form.get(`${who}Photo`);
    if (!(f instanceof File)) continue;
    if (!PHOTO_TYPES.includes(f.type)) return Response.json({ error: "写真の形式が対応していません" }, { status: 400 });
    images.push({ who, file: await toFile(f, `${who}.jpg`, { type: f.type }) });
  }
  if (!images.some((i) => i.who === "child")) {
    return Response.json({ error: "お子さまの写真が必要です" }, { status: 400 });
  }

  try {
    const b64 = await illustrate({ taste: taste as TasteId, story: story as StoryId, sceneIndex, images, quality });
    return Response.json({ image: `data:image/png;base64,${b64}` });
  } catch (e) {
    console.error("trial generation failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "生成に失敗しました" }, { status: 500 });
  }
}
