import type { SupabaseClient } from "@supabase/supabase-js";
import type { Person } from "./catalog";

// 注文ごとの特別対応：ママ・パパの代わりに、ほかの家族（お兄ちゃん・お姉ちゃんなど）を登場させる。
// 台本はそのままで、本文の「ママ」「パパ」を名前に替え、絵ではその年齢の子どもとして描く。
// 2026-10-19 作道さん：注文 34CBC0C8（中野さん）はママ→ゆずき（9歳・お姉ちゃん）、パパ→せいた（7歳・お兄ちゃん）。呼び方は名前だけ。

export type StandIn = {
  /** 本文で「ママ」「パパ」の代わりに使う名前 */
  name: string;
  age: number;
  /** 絵の指示での続柄（英語）。"older sister" など */
  role: string;
  /** 絵の指示での性別（英語） */
  kind: "girl" | "boy";
};
export type StandIns = Partial<Record<Exclude<Person, "child">, StandIn>>;

/** 注文番号（先頭8文字・小文字）ごとの代わりの人 */
const STAND_INS: Record<string, StandIns> = {
  "34cbc0c8": {
    mom: { name: "ゆずき", age: 9, role: "older sister", kind: "girl" },
    dad: { name: "せいた", age: 7, role: "older brother", kind: "boy" },
  },
};

const ROMAJI: Record<string, string> = { ゆずき: "Yuzuki", せいた: "Seita" };

export function standInsForOrder(orderId: string | null | undefined): StandIns | null {
  return (orderId && STAND_INS[orderId.slice(0, 8).toLowerCase()]) || null;
}

/** この下書きの注文に代わりの人がいれば返す（絵を作るときは下書きしか分からないので、注文を探す） */
export async function standInsForDraft(db: SupabaseClient, draftId: string): Promise<StandIns | null> {
  if (!Object.keys(STAND_INS).length) return null;
  const { data } = await db.from("orders").select("id").eq("draft_id", draftId);
  for (const o of data ?? []) {
    const found = standInsForOrder(o.id);
    if (found) return found;
  }
  return null;
}

/** 本文の「ママ」「パパ」を名前に替える */
export function standInText(text: string, s: StandIns | null | undefined) {
  if (!s) return text;
  return text.replaceAll("ママ", s.mom?.name ?? "ママ").replaceAll("パパ", s.dad?.name ?? "パパ");
}

function label(p: StandIn) {
  return `${p.role} ${ROMAJI[p.name] ?? p.name}`;
}

/** 体つき（年齢に合った頭身と背丈） */
function build(p: StandIn) {
  const ratio = p.age <= 8 ? "about 1:5.5 head-to-body, with longer arms and legs and a slimmer face" : "about 1:6 head-to-body, taller and slimmer, with long arms and legs";
  const name = label(p);
  return `${name[0].toUpperCase()}${name.slice(1)} is a ${p.age}-year-old ${p.kind} (${ratio})`;
}

/**
 * 絵の指示の mother / father を代わりの人に替え、子どもとして描く決まりを足す。
 * 指示のどこに出てくる mother / father（場面の説明・服・持ち物の決まり・参考画像の説明）にも効くよう、できあがった指示の文を置き換える
 */
export function standInPrompt(prompt: string, s: StandIns | null | undefined) {
  if (!s) return prompt;
  const people = [s.mom, s.dad].filter((p): p is StandIn => !!p);
  let out = prompt
    .replaceAll("next to the adults", "next to the older siblings")
    // 台本のシリーズの「人間の子どもは主人公だけ」の決まり（SERIES_CAST_RULES）を、きょうだいも描けるように替える
    .replaceAll(
      "The main character is the only human child in this picture book: never draw any other human child,",
      `The main character and ${people.map(label).join(" and ")} are the only human children in this picture book: never draw any other human child,`,
    );
  for (const [word, p] of [["mother", s.mom], ["father", s.dad]] as const) {
    if (!p) continue;
    out = out
      .replace(new RegExp(`\\bthe child's ${word}\\b`, "g"), `the child's ${label(p)}`)
      .replace(new RegExp(`\\b${word}\\b`, "g"), p.role)
      .replace(new RegExp(`\\b${word[0].toUpperCase()}${word.slice(1)}\\b`, "g"), p.role[0].toUpperCase() + p.role.slice(1));
  }
  return [
    out,
    `About the family in this book: the people called ${people.map((p) => `"${p.role}"`).join(" and ")} are the main character's older siblings, not parents. ` +
      `${people.map(build).join("; ")}. Draw them as real children of exactly these ages: shorter than any adult, taller than the main character, with children's faces and children's clothes in the same colors. ` +
      "Never draw them as adults and do not add any adults. If the scene describes something only an adult would do (such as carrying or lifting the main character, cooking, driving or a piggyback ride), draw a natural version that children of these ages can do, such as holding hands or doing it together.",
  ].join(" ");
}
