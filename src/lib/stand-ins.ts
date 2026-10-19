import type { SupabaseClient } from "@supabase/supabase-js";
import { SIBLING_RELATIONS, isSiblingRelation, type Person, type SiblingRelation } from "./catalog";
import { BOOK_BUCKET } from "./services";

// 注文ごとの特別対応：ママ・パパの代わりに、ほかの家族（お兄ちゃん・お姉ちゃんなど）を登場させる。
// 台本はそのままで、本文の「ママ」「パパ」を名前に替え、絵ではその年齢の子どもとして描く。
// 2026-10-19 作道さん：注文 34CBC0C8（中野さん）はママ→ゆずき（9歳・お姉ちゃん）、パパ→せいた（7歳・お兄ちゃん）。呼び方は名前だけ。
// 2026-10-19 作道さん：お客様が写真の画面で、ママ・パパの欄を兄弟姉妹に入れ替えられるように（下書きごとに family.json へ保存）。

export type StandIn = {
  /** 本文で「ママ」「パパ」の代わりに使う名前 */
  name: string;
  age: number;
  /** 絵の指示での続柄（英語）。"older sister" など */
  role: string;
  /** 絵の指示での性別（英語） */
  kind: "girl" | "boy";
  /** 主人公より年下（弟・妹） */
  younger?: boolean;
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

/** お客様が写真の画面で入れた、ママ・パパの欄の代わりの兄弟姉妹（本での呼び方・年齢・続柄） */
export type FamilyMember = { name: string; age: number; relation: SiblingRelation };
export type Family = Partial<Record<Exclude<Person, "child">, FamilyMember>>;

export const FAMILY_NAME_MAX = 10;
export const FAMILY_AGE_MAX = 18;

export function familyPath(draftId: string) {
  return `${draftId}/family.json`;
}

/** 画面から送られた内容をそろえる（おかしな値は入れ替えなしとして扱う） */
export function parseFamily(v: unknown): Family {
  const out: Family = {};
  if (!v || typeof v !== "object") return out;
  for (const who of ["mom", "dad"] as const) {
    const m = (v as Record<string, unknown>)[who] as Partial<FamilyMember> | undefined;
    const name = typeof m?.name === "string" ? m.name.replace(/\s+/g, "").slice(0, FAMILY_NAME_MAX) : "";
    const age = Number(m?.age);
    if (!name || !Number.isInteger(age) || age < 0 || age > FAMILY_AGE_MAX || !isSiblingRelation(m?.relation)) continue;
    out[who] = { name, age, relation: m.relation };
  }
  return out;
}

export function toStandIns(f: Family): StandIns | null {
  const out: StandIns = {};
  for (const who of ["mom", "dad"] as const) {
    const m = f[who];
    if (!m) continue;
    const r = SIBLING_RELATIONS.find((x) => x.id === m.relation)!;
    out[who] = { name: m.name, age: m.age, role: r.role, kind: r.kind, younger: r.younger };
  }
  return Object.keys(out).length ? out : null;
}

export async function saveFamily(db: SupabaseClient, draftId: string, f: Family) {
  const { error } = await db.storage
    .from(BOOK_BUCKET)
    .upload(familyPath(draftId), Buffer.from(JSON.stringify(f)), { contentType: "application/json", upsert: true });
  if (error) throw new Error(error.message);
}

export async function loadFamily(db: SupabaseClient, draftId: string): Promise<Family> {
  const { data } = await db.storage.from(BOOK_BUCKET).download(familyPath(draftId));
  if (!data) return {};
  try {
    return parseFamily(JSON.parse(await data.text()));
  } catch {
    return {};
  }
}

/** 別の下書き（まとめ買いのほかの話）にも同じ入れ替えを写す */
export async function copyFamily(db: SupabaseClient, fromDraft: string, toDraft: string) {
  const f = await loadFamily(db, fromDraft);
  if (Object.keys(f).length) await saveFamily(db, toDraft, f);
}

/**
 * この下書きの代わりの人。お客様が入れた入れ替え（family.json）があればそれ、
 * 無ければ注文ごとの特別対応（絵を作るときは下書きしか分からないので、注文を探す）
 */
export async function standInsForDraft(db: SupabaseClient, draftId: string): Promise<StandIns | null> {
  const own = toStandIns(await loadFamily(db, draftId));
  if (own) return own;
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
  const ratio =
    p.age <= 1
      ? "a baby, about 1:3.5 head-to-body, chubby"
      : p.age <= 3
        ? "a toddler, about 1:4 head-to-body, chubby with short arms and legs"
        : p.age <= 5
          ? "about 1:4.5 head-to-body, small and round-faced"
          : p.age <= 8
            ? "about 1:5.5 head-to-body, with longer arms and legs and a slimmer face"
            : "about 1:6 head-to-body, taller and slimmer, with long arms and legs";
  const name = label(p);
  const height = p.younger ? "younger and shorter than the main character" : "older and taller than the main character";
  return `${name[0].toUpperCase()}${name.slice(1)} is a ${p.age}-year-old ${p.kind} (${ratio}; ${height})`;
}

/**
 * 絵の指示の mother / father を代わりの人に替え、子どもとして描く決まりを足す。
 * 指示のどこに出てくる mother / father（場面の説明・服・持ち物の決まり・参考画像の説明）にも効くよう、できあがった指示の文を置き換える
 */
export function standInPrompt(prompt: string, s: StandIns | null | undefined) {
  if (!s) return prompt;
  const people = [s.mom, s.dad].filter((p): p is StandIn => !!p);
  let out = prompt
    .replaceAll("next to the adults", "next to the siblings")
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
    `About the family in this book: the people called ${people.map((p) => `"${p.role}"`).join(" and ")} are the main character's siblings, not parents. ` +
      `${people.map(build).join("; ")}. Draw them as real children of exactly these ages: shorter than any adult, with children's faces and children's clothes in the same colors. ` +
      "Never draw them as adults and do not add any adults. If the scene describes something only an adult would do (such as carrying or lifting the main character, cooking, driving or a piggyback ride), draw a natural version that children of these ages can do, such as holding hands or doing it together.",
  ].join(" ");
}
