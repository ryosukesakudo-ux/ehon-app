import "server-only";
import { ORIGINAL_CHARACTERS } from "./characters";
import { SHORTS } from "./shorts";
import { getOpenAI, getSupabase } from "./services";
import { KEYS_MAX, KEYS_MIN, PREMISE_MAX, QA_ANSWER_MAX, QA_MAX, emptyKey, emptySegment, fromLegacyClips, toSeconds, type StudioCharacter, type StudioKey, type StudioQA, type StudioSegment, type StudioShort } from "./studio";

// スタジオのサーバー側：Supabase の studio_characters / studio_shorts の読み書きと、AIで英語の指示・台本を書く。

const TEXT_MODELS = () => [...new Set([process.env.OPENAI_TEXT_MODEL, "gpt-5-mini", "gpt-4.1-mini"].filter((m): m is string => !!m))];

const MISSING_TABLE = /relation .* does not exist|schema cache|Could not find the table/i;

function db() {
  const d = getSupabase();
  if (!d) throw new Error("Supabase が未設定です");
  return d;
}

function tableError(e: { message: string }): never {
  if (MISSING_TABLE.test(e.message)) {
    throw new Error("スタジオの表（studio_characters / studio_shorts）がまだありません。Supabase の SQL Editor で supabase/studio.sql を実行してください");
  }
  throw new Error(e.message);
}

// ---------- キャラ ----------

type CharacterRow = {
  id: string; name: string; base: string; role: string; gross: string; personality: string; catchphrase: string;
  voice_ja: string; voice: string; colors: string; design: string; face_ja: string; movement_ja: string; movement: string; sort: number;
};

function rowToCharacter(r: CharacterRow): StudioCharacter {
  return { id: r.id, name: r.name, base: r.base, role: r.role, gross: r.gross, personality: r.personality, catchphrase: r.catchphrase, voiceJa: r.voice_ja, voice: r.voice, colors: r.colors, design: r.design, faceJa: r.face_ja ?? "", movementJa: r.movement_ja ?? "", movement: r.movement ?? "", sort: r.sort };
}

function characterToRow(c: StudioCharacter): CharacterRow {
  return { id: c.id, name: c.name, base: c.base, role: c.role, gross: c.gross, personality: c.personality, catchphrase: c.catchphrase, voice_ja: c.voiceJa, voice: c.voice, colors: c.colors, design: c.design, face_ja: c.faceJa, movement_ja: c.movementJa, movement: c.movement, sort: c.sort };
}

export async function listCharacters(): Promise<StudioCharacter[]> {
  const { data, error } = await db().from("studio_characters").select("*").order("sort").order("created_at");
  if (error) tableError(error);
  return (data as CharacterRow[]).map(rowToCharacter);
}

export async function getCharacter(id: string): Promise<StudioCharacter | null> {
  const { data, error } = await db().from("studio_characters").select("*").eq("id", id).maybeSingle();
  if (error) tableError(error);
  return data ? rowToCharacter(data as CharacterRow) : null;
}

const STR = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** 画面から来た値を整えて保存。id が無ければ新しく作る */
export async function saveCharacter(input: Partial<StudioCharacter>): Promise<StudioCharacter> {
  const id = /^[a-z0-9-]{1,40}$/.test(String(input.id ?? "")) ? String(input.id) : `c-${Math.random().toString(36).slice(2, 8)}`;
  const c: StudioCharacter = {
    id,
    name: STR(input.name, 40),
    base: STR(input.base, 40),
    role: STR(input.role, 60),
    gross: STR(input.gross, 300),
    personality: STR(input.personality, 300),
    catchphrase: STR(input.catchphrase, 60),
    voiceJa: STR(input.voiceJa, 200),
    voice: STR(input.voice, 600),
    colors: STR(input.colors, 200),
    design: STR(input.design, 2500),
    faceJa: STR(input.faceJa, 400),
    movementJa: STR(input.movementJa, 400),
    movement: STR(input.movement, 800),
    sort: Number.isFinite(Number(input.sort)) ? Number(input.sort) : 0,
  };
  if (!c.name) throw new Error("名前を入れてください");
  const { error } = await db().from("studio_characters").upsert({ ...characterToRow(c), updated_at: new Date().toISOString() });
  if (error) tableError(error);
  return c;
}

export async function deleteCharacter(id: string) {
  const { error } = await db().from("studio_characters").delete().eq("id", id);
  if (error) tableError(error);
}

// ---------- ショート ----------

// clips 列（jsonb）に保存する形。以前は [クリップA, クリップB] の配列、2026-10-20 からは { v: 2, keys, segments }。列を増やさず同じ列に入れる（SQL の再実行が不要）
type ShortRow = { id: string; title: string; character_id: string | null; premise: string; qa: unknown; clips: unknown; created_at: string };

function cleanQa(v: unknown): StudioQA[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
    .map((x) => ({ q: STR(x.q, 200), a: STR(x.a, QA_ANSWER_MAX) }))
    .filter((x) => x.q)
    .slice(0, QA_MAX);
}

function cleanKey(v: unknown): StudioKey {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { scene: STR(o.scene, 400), frame: STR(o.frame, 1500) };
}

function cleanSegment(v: unknown): StudioSegment {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { motion: STR(o.motion, 2000), sound: STR(o.sound, 300), seconds: toSeconds(o.seconds) };
}

/** 止め絵と区間を整える：絵は 2〜KEYS_MAX 枚、区間は絵の数 − 1 */
function cleanBody(keys: unknown, segments: unknown): Pick<StudioShort, "keys" | "segments"> {
  const ks = (Array.isArray(keys) ? keys : []).map(cleanKey).slice(0, KEYS_MAX);
  while (ks.length < KEYS_MIN) ks.push(emptyKey());
  const ss = (Array.isArray(segments) ? segments : []).map(cleanSegment).slice(0, ks.length - 1);
  while (ss.length < ks.length - 1) ss.push(emptySegment());
  return { keys: ks, segments: ss };
}

/** 保存されている clips 列の中身を読む（以前の配列の形も受け付ける） */
function readBody(clips: unknown): Pick<StudioShort, "keys" | "segments"> {
  if (Array.isArray(clips)) {
    const legacy = fromLegacyClips(clips.map((c) => (c && typeof c === "object" ? c : {})));
    return cleanBody(legacy.keys, legacy.segments);
  }
  const o = (clips && typeof clips === "object" ? clips : {}) as Record<string, unknown>;
  return cleanBody(o.keys, o.segments);
}

function rowToShort(r: ShortRow): StudioShort {
  return {
    id: r.id,
    title: r.title,
    characterId: r.character_id,
    premise: r.premise,
    qa: cleanQa(r.qa),
    ...readBody(r.clips),
    createdAt: r.created_at,
  };
}

/** 以前の形（クリップA/B）のまま保存されているか。絵と動画のファイルを新しい置き場所に写す判断に使う */
export async function isLegacyShort(id: string) {
  const { data, error } = await db().from("studio_shorts").select("clips").eq("id", id).maybeSingle();
  if (error) tableError(error);
  return Array.isArray((data as { clips?: unknown } | null)?.clips);
}

export async function listShorts(): Promise<StudioShort[]> {
  const { data, error } = await db().from("studio_shorts").select("*").order("created_at", { ascending: false });
  if (error) tableError(error);
  return (data as ShortRow[]).map(rowToShort);
}

export async function getShort(id: string): Promise<StudioShort | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data, error } = await db().from("studio_shorts").select("*").eq("id", id).maybeSingle();
  if (error) tableError(error);
  return data ? rowToShort(data as ShortRow) : null;
}

export async function saveShort(input: Partial<StudioShort>): Promise<StudioShort> {
  const row = {
    ...(input.id && /^[0-9a-f-]{36}$/.test(input.id) ? { id: input.id } : {}),
    title: STR(input.title, 60),
    character_id: typeof input.characterId === "string" && input.characterId ? input.characterId : null,
    premise: STR(input.premise, PREMISE_MAX),
    qa: cleanQa(input.qa),
    clips: { v: 2, ...cleanBody(input.keys, input.segments) },
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db().from("studio_shorts").upsert(row).select("*").single();
  if (error) tableError(error);
  return rowToShort(data as ShortRow);
}

export async function deleteShort(id: string) {
  const { error } = await db().from("studio_shorts").delete().eq("id", id);
  if (error) tableError(error);
}

// ---------- 初期データ（コード直書きの6体と「かじっていい？」）を取り込む ----------

const SEED_FACE: Record<string, string> = {
  gajiri: "外皮（帽子＋殻）に目はない。歯は帽子と殻のすき間だけ（上の歯は帽子のふち、下の歯は殻のふち）。帽子が開くと中の身が見え、身には黒いまん丸の目2つと歯のない小さな口。噛むのは殻の歯で、中の身は噛まないし出てこない。",
};

export async function importSeeds() {
  const d = db();
  const existing = await listCharacters();
  const have = new Set(existing.map((c) => c.id));
  const rows = ORIGINAL_CHARACTERS.filter((c) => !have.has(c.id)).map((c, i) => characterToRow({ ...c, faceJa: SEED_FACE[c.id] ?? "", movementJa: "", movement: "", sort: existing.length + i }));
  if (rows.length) {
    const { error } = await d.from("studio_characters").insert(rows);
    if (error) tableError(error);
  }
  const shorts = await listShorts();
  let added = 0;
  for (const s of SHORTS) {
    if (shorts.some((x) => x.title === s.title)) continue;
    await saveShort({
      title: s.title,
      characterId: s.character,
      premise: "ガジリが夜に小石をかじって痛がり、朝に子どもに拾われてもただのどんぐりのふりをする",
      ...fromLegacyClips(s.clips),
    });
    added++;
  }
  return { characters: rows.length, shorts: added };
}

// ---------- AI ----------

/** 共通: 顔の構造を必ず書かせる（2026-10-18 ガジリで体に別の口が生えた対策） */
const DESIGN_RULES = [
  "design は英語。最初にキャラ名を大文字で書き、もとの物・色（16進で）・体の形を書く。",
  "次に FACE ANATOMY として、口と目が体のどこにあるか、何が口になるか（例：帽子と実のすき間が唯一の口）、目の形と数、口を開けるとどう見えるか、体のほかの場所には顔を描かないことを、絵のAIが迷わないよう具体的に書く。",
  "キモ要素は見た目として具体的に（数・位置・質感）。かわいさは黒いまん丸の目と丸い体で残す。",
  "既存の有名キャラ（ポケモン・アンパンマン・ちいかわ など）の名前や特徴は書かない。文字・ロゴは描かせない。",
  "voice は英語で1〜2文。言葉は話さない鳴き声・体の音だけ（例：short squeaks like 'kyu!' and teeth clicking）。機械的でない、手作りコマ撮り映画の小さな生き物の声。",
  "movement は英語で2〜4文。歩き方・速さ・驚いたときや怒ったときの体の反応・癖など、動画AIが動きを決めるのに必要なことを書く。顔の構造と矛盾させない（例：噛むのは殻の歯で中の身は噛まない）。",
].join("\n");

const ENGLISH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["design", "voice", "movement"],
  properties: { design: { type: "string" }, voice: { type: "string" }, movement: { type: "string" } },
} as const;

/** 日本語の設定から、絵のAI用の英語の見た目の指示と鳴き声の指示を書く */
export async function writeCharacterEnglish(c: Partial<StudioCharacter>): Promise<{ design: string; voice: string; movement: string }> {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const system = ["あなたはキャラクターデザイナー兼アニメ演出家です。日本語の設定表から、画像生成AIと動画生成AIに渡す英語の指示を書きます。", DESIGN_RULES].join("\n");
  const user = [
    `名前: ${c.name ?? ""}`, `もとの物: ${c.base ?? ""}`, `役割: ${c.role ?? ""}`, `キモ要素: ${c.gross ?? ""}`,
    `顔の構造: ${c.faceJa ?? ""}`, `性格: ${c.personality ?? ""}`, `動き方・癖: ${c.movementJa ?? ""}`,
    `口ぐせ: ${c.catchphrase ?? ""}`, `鳴き声: ${c.voiceJa ?? ""}`, `配色: ${c.colors ?? ""}`,
    c.design ? `今の design（直す場合の元。日本語の設定と食い違うところは日本語に合わせる）: ${c.design}` : "",
  ].filter(Boolean).join("\n");
  return runJson<{ design: string; voice: string; movement: string }>(ai, system, user, "character_english", ENGLISH_SCHEMA);
}

const KEY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scene", "frame"],
  properties: { scene: { type: "string" }, frame: { type: "string" } },
} as const;

const SEGMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["motion", "sound", "seconds"],
  properties: { motion: { type: "string" }, sound: { type: "string" }, seconds: { type: "integer", enum: [4, 6, 8] } },
} as const;

const SCRIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "keys", "segments"],
  properties: { title: { type: "string" }, keys: { type: "array", items: KEY_SCHEMA }, segments: { type: "array", items: SEGMENT_SCHEMA } },
} as const;

const QUESTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["enough", "questions"],
  properties: {
    enough: { type: "boolean", description: "台本を書くのに十分な情報がそろっているか" },
    questions: { type: "array", items: { type: "string" }, description: "まだ聞きたいこと（0〜4問）" },
  },
} as const;

/** 止め絵方式の説明（ヒアリングと台本で共通） */
const KEYFRAME_RULES = [
  "作り方（止め絵方式）: お話を『止め絵（キーフレーム）』3〜5枚に分け、隣り合う2枚の間を動画AI（Veo）が4〜8秒で動かす。動画AIは最初と最後の絵にはよく従うが、途中の細かい動きは文章だけだと流されやすい。だから『見せたい瞬間』は全部止め絵にする。",
  "止め絵は『止まった姿』にする（例：小石を帽子と殻の歯でがっちり挟み、半分はみ出した状態で力んでいる）。1つの区間（絵と絵の間）で起きる動作は1〜2個まで。",
].join("\n");

/**
 * 台本を書く前のヒアリング（2026-10-19 作道さん）。ざっくりしたねらいから、AIが足りない情報を質問する。
 * 十分にそろったら enough=true・質問なしを返す。
 */
export async function askShortQuestions(c: StudioCharacter, premise: string, qa: StudioQA[]): Promise<{ enough: boolean; questions: string[] }> {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const system = [
    "あなたは子ども向けショートアニメ（縦長・15〜25秒・セリフなし・キャラ1体）の演出家です。これから台本を書くために、監督（作道さん）にまだ決まっていないことを日本語で質問します。",
    KEYFRAME_RULES,
    "同じ場所・同じ時間で小さな出来事をひとつ見せる。セリフはなく鳴き声と動きだけ。",
    "聞くとよいこと：場所と時間帯、きっかけになる物や相手（人の手など、顔は映さない）、キャラが何をして何が起きるか、オチ（最後にどうなるか）、テンポ（ゆっくり／せわしない）、避けたいこと。",
    "必ず聞くこと（まだ答えがなければ）：『いちばん見せたい見せ場（キメの瞬間）はどんな姿か』。例：小石を歯でがっちり挟んで力んでいる姿。見せ場は止め絵の1枚にする。",
    "すでに分かっていること・キャラ設定から決められること・細かすぎることは聞かない。1問は50文字まで、やさしい話し言葉。",
    `質問は一度に4問まで、これまでの質問と合わせて${QA_MAX}問まで。台本を書くのに十分なら enough=true にして質問は空にする。`,
  ].join("\n");
  const user = [
    `キャラ: ${c.name}（${c.base}、${c.role}）`,
    `キモ要素: ${c.gross}`, `顔の構造: ${c.faceJa}`, `性格: ${c.personality}`, `動き方・癖: ${c.movementJa}`, `鳴き声: ${c.voiceJa}`,
    `監督のねらい: ${premise || "（まだ書いていない）"}`,
    ...(qa.length ? ["これまでの質問と答え:", ...qa.map((x) => `- ${x.q} → ${x.a || "（未回答）"}`)] : []),
  ].join("\n");
  const body = await runJson<{ enough: boolean; questions: string[] }>(ai, system, user, "short_questions", QUESTIONS_SCHEMA);
  const room = Math.max(0, QA_MAX - qa.length);
  const questions = body.questions.map((q) => q.trim()).filter(Boolean).slice(0, Math.min(4, room));
  return { enough: body.enough || questions.length === 0, questions };
}

/** キャラとねらいから、止め絵3〜5枚と区間の台本を書く */
export async function writeShortScript(c: StudioCharacter, premise: string, qa: StudioQA[], current?: StudioShort): Promise<Pick<StudioShort, "title" | "keys" | "segments">> {
  const ai = getOpenAI();
  if (!ai) throw new Error("OPENAI_API_KEY が未設定です");
  const system = [
    "あなたは子ども向けショートアニメ（YouTube ショート、縦長、15〜25秒）の演出家です。1体のオリジナルキャラが出る、1話完結の短い台本を書きます。",
    KEYFRAME_RULES,
    `構成: keys（止め絵）を4〜${KEYS_MAX}枚（最低でも3枚）、segments（区間）を keys の数 − 1 個。区間 n は 絵 n から 絵 n+1 へ動く。合計は15〜25秒。見せ場（キメの瞬間）は必ず止め絵の1枚にし、その直前の区間はその姿に向かって進んで最後の1〜2秒はその姿のまま止まる。次の区間はその結果（欠けて飛び散る、吐き出す、驚く など）。`,
    "同じ場所・同じ時間・同じカメラ距離で、ひとつの小さな出来事を最後まで見せる。場面転換はしない。",
    "1区間の動作は1〜2個まで。物を『持つ・挟む・噛む』ときは、物が口や手の中に消えないよう、半分見えている状態を文章で指定する。小道具はキャラの体に対して十分大きく（歯のすき間に入って見えなくならない大きさ、目安は体の1/4〜1/3）。絵に出てくる物（小石など）は全部の止め絵で同じ大きさ・同じ形にし、どこにあるかを毎回書く。",
    "セリフは一切なし。キャラは言葉を話さず、鳴き声と体の音だけ。人間が出る場合も顔は映さず、声は息をのむ程度まで。文字・吹き出し・字幕も出さない。",
    "キャラの見た目は design の FACE ANATOMY どおり。口や目の場所を変えない。体の中に別の生き物や顔がいるように描かせない（例：殻そのものが口であって、中から何かが出てきて噛むのではない）。",
    "keys の項目: scene（日本語、その瞬間に何が見えているか、30〜80字）、frame（英語、絵の指示：場所・光・キャラの姿勢と表情・小道具の位置、キャラは画面の下2/3、縦長、止まった状態。60〜140語）。",
    "segments の項目: sound（日本語、効果音と鳴き声、20〜60字）、motion（英語、その区間で起きる動きと音の順番。'From the first frame to the last frame:' で始め、最後の1〜2秒は最後の絵の姿で止まると書く。カメラはゆっくり、カットなし。鳴き声は voice の説明に合わせる。50〜120語）、seconds（4・6・8 のどれか。基本は4か6：動作1個なら4、2個なら6。8は「ゆっくり見せたい」区間だけに使い、全区間を8にはしない）。",
    "title は日本語で8文字まで、キャラの行動が分かる言葉。",
  ].join("\n");
  const user = [
    `キャラ: ${c.name}（${c.base}、${c.role}）`,
    `キモ要素: ${c.gross}`,
    `顔の構造: ${c.faceJa}`,
    `性格: ${c.personality}`,
    `動き方・癖: ${c.movementJa}`,
    `鳴き声: ${c.voiceJa}`,
    `design: ${c.design}`,
    `voice: ${c.voice}`,
    `movement: ${c.movement}`,
    `ねらい・あらすじ: ${premise || "（おまかせ。キャラのキモ要素と性格がいちばん出る小さな出来事）"}`,
    ...(qa.length ? ["監督への質問と答え（必ず反映する）:", ...qa.map((x) => `- ${x.q} → ${x.a || "（未回答・おまかせ）"}`)] : []),
    // 今の台本は内容（場所・出来事・見せ場）の参考にだけ使い、絵の枚数と秒数は引き継がせない（以前のA/B形式を写した「8秒×2」のまま書き直されたため：2026-10-20 作道さん）
    current?.keys.some((k) => k.scene || k.frame) ? `今の台本（場所・出来事・見せ場の参考。絵の枚数と区間の秒数はこれに合わせず、上の構成のルールで決め直す）: ${JSON.stringify({ keys: current.keys.map((k) => k.scene || k.frame), segments: current.segments.map((g) => g.motion) })}` : "",
  ].filter(Boolean).join("\n");
  const body = await runJson<{ title: string; keys: StudioKey[]; segments: StudioSegment[] }>(ai, system, user, "short_script", SCRIPT_SCHEMA);
  // 絵の数と区間の数を合わせる（絵 = 区間 + 1）
  const keys = body.keys.slice(0, KEYS_MAX);
  while (keys.length < KEYS_MIN) keys.push(emptyKey());
  const segments = body.segments.slice(0, keys.length - 1).map((x) => ({ ...x, seconds: toSeconds(x.seconds) }));
  while (segments.length < keys.length - 1) segments.push(emptySegment());
  return { title: body.title, keys, segments };
}

async function runJson<T>(ai: NonNullable<ReturnType<typeof getOpenAI>>, system: string, user: string, name: string, schema: Record<string, unknown>): Promise<T> {
  let lastError: unknown = null;
  for (const model of TEXT_MODELS()) {
    try {
      const res = await ai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
      });
      const raw = res.choices[0]?.message?.content;
      if (!raw) throw new Error(`empty response (${res.choices[0]?.finish_reason ?? "no choice"})`);
      return JSON.parse(raw) as T;
    } catch (e) {
      console.error(`studio ${name} with ${model} failed`, e);
      lastError = e;
    }
  }
  throw lastError ?? new Error("no model");
}
