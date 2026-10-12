import { CHILD_AGES } from "@/lib/catalog";
import { CAST_ABOUT_MAX, CAST_NAME_MAX, MAX_CAST, SYNOPSIS_MAX } from "@/lib/custom-story";
import { STORY_GEN_DAILY, claimStoryGeneration, cleanAnswers, cleanCastInput, generateCustomStory } from "@/lib/custom-story-server";
import { currentUser, authKeys } from "@/lib/auth";

export const maxDuration = 120;

// オリジナルのお話：あらすじ（と、ほかの登場人物の名前）から、AIが題名と12場面の文・絵の内容を作る。
// AIの費用がかかるので会員だけ・1日の回数に上限あり（Supabase が未設定のデモモードでは誰でも仮のお話）。
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const synopsis = typeof body?.synopsis === "string" ? body.synopsis.replace(/\s+/g, " ").trim() : "";
  const childName = typeof body?.childName === "string" ? body.childName.trim() : "";
  const childAge = Number(body?.childAge);
  const level = body?.level;
  // ほかの登場人物（名前・人か動物か・どんな人か）。5人まで
  const cast = cleanCastInput(body?.cast);
  // 作る前のAIの質問への答え（任意）
  const answers = cleanAnswers(body?.answers);
  if (!synopsis) return Response.json({ error: "あらすじを入力してください" }, { status: 400 });
  if ([...synopsis].length > SYNOPSIS_MAX) return Response.json({ error: `あらすじは${SYNOPSIS_MAX}文字以内で入力してください` }, { status: 400 });
  if (!childName || childName.length > 12) return Response.json({ error: "先に主人公の名前を入力してください" }, { status: 400 });
  if (!CHILD_AGES.includes(childAge)) return Response.json({ error: "先に主人公の年齢を選んでください" }, { status: 400 });
  if (level !== "s" && level !== "n" && level !== "l") return Response.json({ error: "文の量を選んでください" }, { status: 400 });
  if (!answers) return Response.json({ error: "質問への答えは100文字以内で入れてください" }, { status: 400 });
  if (!cast) {
    return Response.json({ error: `登場人物は${MAX_CAST}人まで、名前は${CAST_NAME_MAX}文字・説明は${CAST_ABOUT_MAX}文字以内で入れてください` }, { status: 400 });
  }

  if (authKeys()) {
    const user = await currentUser();
    if (!user) return Response.json({ error: "オリジナルのお話は、無料会員登録・ログインのあとに作れます", needLogin: true }, { status: 401 });
    if (!(await claimStoryGeneration(user.id))) {
      return Response.json({ error: `お話を作れるのは1日${STORY_GEN_DAILY}回までです。明日またお試しください` }, { status: 429 });
    }
  }

  try {
    const story = await generateCustomStory({ synopsis, childName, childAge, level, cast, answers });
    return Response.json({ story });
  } catch (e) {
    console.error("custom story failed", e);
    return Response.json({ error: "お話を作れませんでした。あらすじを少し変えて、もう一度お試しください" }, { status: 500 });
  }
}
