import { CHILD_AGES } from "@/lib/catalog";
import { SYNOPSIS_MAX } from "@/lib/custom-story";
import { askStoryQuestions, cleanCastInput } from "@/lib/custom-story-server";
import { currentUser, authKeys } from "@/lib/auth";

export const maxDuration = 60;

// オリジナルのお話を作る前に、絵がずれないように確かめたいことをAIが質問する（0〜3問）。
// お話づくりと同じく会員だけ。回数には数えない（質問は短く、費用が小さいため）。
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const synopsis = typeof body?.synopsis === "string" ? body.synopsis.replace(/\s+/g, " ").trim() : "";
  const childName = typeof body?.childName === "string" ? body.childName.trim() : "";
  const childAge = Number(body?.childAge);
  const cast = cleanCastInput(body?.cast);
  if (!synopsis || [...synopsis].length > SYNOPSIS_MAX) return Response.json({ error: `あらすじは${SYNOPSIS_MAX}文字以内で入力してください` }, { status: 400 });
  if (!childName || childName.length > 12 || !CHILD_AGES.includes(childAge) || !cast) {
    return Response.json({ error: "主人公の名前・年齢と登場人物を確かめてください" }, { status: 400 });
  }
  if (authKeys() && !(await currentUser())) {
    return Response.json({ error: "オリジナルのお話は、無料会員登録・ログインのあとに作れます", needLogin: true }, { status: 401 });
  }
  return Response.json({ questions: await askStoryQuestions({ synopsis, childName, childAge, cast }) });
}
