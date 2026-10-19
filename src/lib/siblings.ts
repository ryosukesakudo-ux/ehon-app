import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SIBLING_RELATIONS, isSiblingRelation, type SiblingRelation } from "./catalog";
import { getBook, type Book, type SiblingOverlay } from "./book";
import { LEVELS, parseSeriesKey, seriesKey, type LevelId } from "./story-key";
import { BOOK_BUCKET, getOpenAI } from "./services";

// ママ・パパとは別に足す兄弟姉妹（最大2人。2026-10-19 作道さん「イ」：12場面すべてで主人公と一緒に冒険する）。
// 台本のシリーズの文と絵の指示を、下書きを作るときにAIで書き直して、絵の隣（BOOK_BUCKET {下書き}/siblings.json）に保存する。
// 絵の仕組みはオリジナルのお話の「ほかの登場人物」（Companion 1, 2・キャラクターの場面 104〜）をそのまま使う。

export const MAX_SIBLINGS = 2;
export const SIBLING_NAME_MAX = 10;
export const SIBLING_AGE_MAX = 18;

export type Sibling = { name: string; age: number; relation: SiblingRelation; photo: string | null };

/** 書き直した文と絵の指示。base は書き直した元のお話（文の量を除いた番号）。文は文の量（s / n / l）ごと */
export type SiblingRewrite = { base: string; cover: string; scenes: { texts: Record<LevelId, string>; art: string }[] };

type SiblingFile = { siblings: Sibling[]; rewrite: SiblingRewrite | null };

export function siblingsPath(draftId: string) {
  return `${draftId}/siblings.json`;
}

/** 画面から送られた兄弟姉妹（呼び方・年齢・続柄）をそろえる。おかしな値の人は外す */
export function parseSiblings(v: unknown): Omit<Sibling, "photo">[] {
  if (!Array.isArray(v)) return [];
  return v
    .flatMap((m: Partial<Sibling>) => {
      const name = typeof m?.name === "string" ? m.name.replace(/\s+/g, "").slice(0, SIBLING_NAME_MAX) : "";
      const age = Number(m?.age);
      if (!name || !Number.isInteger(age) || age < 0 || age > SIBLING_AGE_MAX || !isSiblingRelation(m?.relation)) return [];
      return [{ name, age, relation: m.relation }];
    })
    .slice(0, MAX_SIBLINGS);
}

async function loadFile(db: SupabaseClient, draftId: string): Promise<SiblingFile | null> {
  const { data } = await db.storage.from(BOOK_BUCKET).download(siblingsPath(draftId));
  if (!data) return null;
  try {
    const v = JSON.parse(await data.text());
    const siblings = parseSiblings(v?.siblings).map((s, i) => ({ ...s, photo: typeof v.siblings[i]?.photo === "string" ? v.siblings[i].photo : null }));
    return { siblings, rewrite: v?.rewrite && Array.isArray(v.rewrite.scenes) ? v.rewrite : null };
  } catch {
    return null;
  }
}

async function saveFile(db: SupabaseClient, draftId: string, f: SiblingFile) {
  const { error } = await db.storage
    .from(BOOK_BUCKET)
    .upload(siblingsPath(draftId), Buffer.from(JSON.stringify(f)), { contentType: "application/json", upsert: true });
  if (error) throw new Error(error.message);
}

/** 書き直しの元（文の量を除いたお話の番号）。文の量を変えても同じ書き直しを使う */
function rewriteBase(story: string) {
  const k = parseSeriesKey(story);
  return k ? `${k.series}:${k.episode}:${k.combo ?? "both"}:k${k.siblings}` : story;
}

/** 絵の指示での見た目（例：a 5-year-old girl, the main character's younger sister） */
function siblingLook(s: Pick<Sibling, "age" | "relation">) {
  const r = SIBLING_RELATIONS.find((x) => x.id === s.relation)!;
  const size = r.younger ? "younger and shorter than the main character" : "older and taller than the main character";
  return `a ${s.age}-year-old ${r.kind}, the main character's ${r.role} (${size}), a real child with a child's face and body`;
}

function overlayOf(f: SiblingFile, story: string): SiblingOverlay | null {
  if (!f.siblings.length) return null;
  return {
    cast: f.siblings.map((s) => ({ name: s.name, kind: "person" as const, look: siblingLook(s) })),
    rewrite: f.rewrite && f.rewrite.base === rewriteBase(story) && f.rewrite.scenes.length ? f.rewrite : null,
  };
}

/** 兄弟姉妹を足した下書きの絵本（書き直しが無いときは、元の文のまま絵にだけ一緒に描く） */
export async function bookForDraft(db: SupabaseClient | null, draft: { id: string; story: string }): Promise<Book | null> {
  if (!db || !parseSeriesKey(draft.story)?.siblings) return getBook(draft.story);
  const f = await loadFile(db, draft.id);
  return getBook(draft.story, f ? overlayOf(f, draft.story) : null);
}

/** 兄弟姉妹の写真の保存先（PHOTO_BUCKET。写真が無い人は null） */
export async function siblingPhotos(db: SupabaseClient, draftId: string): Promise<(string | null)[]> {
  return ((await loadFile(db, draftId))?.siblings ?? []).map((s) => s.photo);
}

/** 兄弟姉妹の1人の写真を差し替える（プレビューの「写真を変える」） */
export async function setSiblingPhoto(db: SupabaseClient, draftId: string, i: number, photo: string) {
  const f = await loadFile(db, draftId);
  if (!f?.siblings[i]) throw new Error("sibling not found");
  f.siblings[i] = { ...f.siblings[i], photo };
  await saveFile(db, draftId, f);
}

/** 下書きを作るときに、兄弟姉妹を保存して文と絵の指示を書き直す（書き直しに失敗しても、兄弟姉妹は保存する） */
export async function saveSiblingsWithRewrite(db: SupabaseClient, draftId: string, story: string, siblings: Sibling[]) {
  const rewrite = await rewriteStory(story, siblings).catch((e) => {
    console.error("sibling rewrite failed", e);
    return null;
  });
  await saveFile(db, draftId, { siblings, rewrite });
}

/** まとめ買いのほかの話の下書きに、同じ兄弟姉妹を写して、その話の文を書き直す */
export async function copySiblings(db: SupabaseClient, fromDraft: string, toDraft: string, story: string) {
  const f = await loadFile(db, fromDraft);
  if (f?.siblings.length) await saveSiblingsWithRewrite(db, toDraft, story, f.siblings);
}

const TEXT_MODELS = () => [...new Set([process.env.OPENAI_TEXT_MODEL, "gpt-5-mini", "gpt-4.1-mini"].filter((m): m is string => !!m))];

const LEVEL_RULES: Record<LevelId, string> = {
  s: "ひらがなとカタカナだけ（漢字なし）、元の文と同じくらい短く",
  n: "ひらがなとカタカナだけ（漢字なし）、元の文と同じくらいの長さ",
  l: "小学1〜4年生で習う漢字だけ、漢字には元の文と同じ 漢字《かんじ》 の形でふりがな、元の文と同じくらいの長さ",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cover", "scenes"],
  properties: {
    cover: { type: "string", description: "表紙の絵の指示（英語）" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["s", "n", "l", "art"],
        properties: {
          s: { type: "string" },
          n: { type: "string" },
          l: { type: "string" },
          art: { type: "string", description: "この場面の絵の指示（英語）" },
        },
      },
    },
  },
} as const;

/** 台本の12場面の文（3段階）と絵の指示を、兄弟姉妹も一緒に冒険するように書き直す */
async function rewriteStory(story: string, siblings: Pick<Sibling, "name" | "age" | "relation">[]): Promise<SiblingRewrite | null> {
  const ai = getOpenAI();
  const k = parseSeriesKey(story);
  if (!ai || !k || !siblings.length) return null;
  const books = LEVELS.map((l) => getBook(seriesKey(k.series, k.episode, l.id, k.combo)));
  if (books.some((b) => !b)) return null;
  const [s, n, l] = books as Book[];
  const labels = siblings.map((x, i) => `Companion ${i + 1}`);
  const who = siblings.map((x, i) => `「${x.name}」（${x.age}さい・主人公の${SIBLING_RELATIONS.find((r) => r.id === x.relation)!.label}。絵の指示では ${labels[i]}）`).join("、");
  const system = [
    "あなたは日本の幼児向け絵本の編集者です。できあがっている12場面の絵本に、主人公のきょうだいを登場させるため、本文と絵の指示を書き直します。",
    `きょうだい：${who}。本文では、この呼び方をそのまま使う。`,
    "12場面すべてで、きょうだいも主人公といっしょにいて、いっしょに冒険する。お話の流れ・場面の順番・できごと・ほかの登場人物（相棒の動物やママ・パパなど）は変えない。主人公がお話の中心のまま。",
    "「{name}」は主人公の名前が入る場所なので、そのまま残す。「ふたり」など人数を表す言葉は、きょうだいを入れた人数に直す。",
    `本文は文の量ごとに3つ：s（${LEVEL_RULES.s}）、n（${LEVEL_RULES.n}）、l（${LEVEL_RULES.l}）。元の文の言い回しと改行をできるだけ残す。`,
    `絵の指示（art・cover）は英語。元の指示をもとに、きょうだいを ${labels.join(" and ")} として書き足す（名前は書かない）。主人公は "the child" のまま。服装は書かない。`,
  ].join("\n");
  const user = JSON.stringify({
    cover: s.cover,
    scenes: s.scenes.map((sc, i) => ({ s: sc.text, n: n.scenes[i].text, l: l.scenes[i].text, art: sc.art })),
  });
  let lastError: unknown = null;
  for (const model of TEXT_MODELS()) {
    try {
      const res = await ai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name: "sibling_rewrite", strict: true, schema: SCHEMA } },
      });
      const raw = res.choices[0]?.message?.content;
      if (!raw) throw new Error(`empty response (${res.choices[0]?.finish_reason ?? "no choice"})`);
      const body = JSON.parse(raw) as { cover: string; scenes: { s: string; n: string; l: string; art: string }[] };
      if (body.scenes?.length !== s.scenes.length || body.scenes.some((x) => !x.s.trim() || !x.n.trim() || !x.l.trim() || !x.art.trim())) {
        throw new Error(`scenes: ${body.scenes?.length}`);
      }
      return {
        base: rewriteBase(story),
        cover: body.cover.trim() || s.cover,
        scenes: body.scenes.map((x) => ({ texts: { s: x.s.trim(), n: x.n.trim(), l: x.l.trim() }, art: x.art.trim() })),
      };
    } catch (e) {
      console.error(`sibling rewrite with ${model} failed`, e);
      lastError = e;
    }
  }
  throw lastError ?? new Error("no model");
}
