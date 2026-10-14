"use client";

import { useState } from "react";
import Link from "next/link";
import { CAST_ABOUT_MAX, CAST_KIND_LABEL, CAST_NAME_MAX, CUSTOM_TEXT_MAX, CUSTOM_TITLE_MAX, MAX_CAST, SYNOPSIS_MAX, castLabel, customKey, parseCustomKey, type CastInput, type CastKind, type CustomStory } from "@/lib/custom-story";
import { LEVELS, levelForAge, type LevelId } from "@/lib/story-key";
import { Chevron } from "@/components/icons";
import { DrawingWait } from "../drawing-wait";
import { useFlow } from "../flow";

/** 質問への答えの長さ（サーバーの ANSWER_MAX と同じ） */
const ANSWER_MAX = 100;
import { loginHref } from "../account";

// オリジナルのお話：あらすじを入れるとAIが12ページのお話を作り、文はその場で自由に直せる。

const textareaStyle = { padding: "10px 12px", borderRadius: 12, border: "2px solid #d9cfbd", fontSize: 16, lineHeight: 1.7, fontFamily: "inherit", resize: "vertical" } as const;

/**
 * open・onOpenChange を渡すと、開く・閉じるを呼び出し側で決め、この中の大きなボタンは出さない
 * （お話選びの2×2のカードから開くとき）
 */
export function CustomStoryPanel({ open: openProp, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void } = {}) {
  const { state, update } = useFlow();
  const story = parseCustomKey(state.story);
  // 開くかどうか（未操作なら、オリジナルのお話を選んでいるときに開く。保存していた入力をあとから読むため）
  const [toggled, setToggled] = useState<boolean | null>(null);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : (toggled ?? !!story);
  const [synopsis, setSynopsis] = useState("");
  const [level, setLevel] = useState<LevelId>(story?.level ?? levelForAge(state.childAge));
  // ほかの登場人物（ペットやおばあちゃんなど）。お話を作ったあとは、そのお話の登場人物から始める
  const [cast, setCast] = useState<CastInput[] | null>(null);
  const castRows = cast ?? story?.cast.map(({ name, kind, about }) => ({ name, kind, about })) ?? [];
  const castOk = castRows.every((c) => c.name.trim());
  const castChanged = !!story && JSON.stringify(castRows.map((c) => [c.name.trim(), c.kind, c.about.trim()])) !== JSON.stringify(story.cast.map((c) => [c.name, c.kind, c.about]));
  const setRow = (i: number, patch: Partial<CastInput>) => setCast(castRows.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const [busy, setBusy] = useState<"asking" | "writing" | false>(false);
  // 作る前のAIの質問（null はまだ聞いていない）と、お客様の答え
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const nameOk = state.childName.trim().length > 0;
  const ageOk = !!state.childAge;

  // 開いたら、選んでいたシリーズのお話を外す（オリジナルのお話ができるまで先へ進めないように。
  // 外さないと、お話を作らずに進んだときシリーズのお話でプレビューが作られてしまう）
  function toggle() {
    if (!open && !story && state.story) update({ story: "", previews: {}, draftId: null });
    setToggled(!open);
    onOpenChange?.(!open);
  }

  const save = (s: CustomStory) => update({ story: customKey(s), previews: {}, draftId: null });

  const cleanCast = () => castRows.map((c) => ({ ...c, name: c.name.trim(), about: c.about.trim() }));

  // まず、絵がずれないように確かめたいことをAIに聞いてもらう（0〜3問）。質問が無ければそのままお話を作る
  async function ask() {
    setBusy("asking");
    setError(null);
    setNeedLogin(false);
    try {
      const res = await fetch("/api/stories/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ synopsis, childName: state.childName.trim(), childAge: state.childAge, cast: cleanCast() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNeedLogin(!!json.needLogin);
        throw new Error(json.error ?? "お話を作れませんでした");
      }
      const qs: string[] = Array.isArray(json.questions) ? json.questions : [];
      if (!qs.length) return generate([]);
      setQuestions(qs);
      setAnswers(qs.map(() => ""));
      setBusy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "お話を作れませんでした");
      setBusy(false);
    }
  }

  async function generate(qa: { q: string; a: string }[]) {
    setBusy("writing");
    setError(null);
    setNeedLogin(false);
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ synopsis, childName: state.childName.trim(), childAge: state.childAge, level, cast: cleanCast(), answers: qa }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.story) {
        setNeedLogin(!!json.needLogin);
        throw new Error(json.error ?? "お話を作れませんでした");
      }
      save(json.story);
      setCast(null);
      setQuestions(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "お話を作れませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {!controlled && <button type="button" className="choice" aria-expanded={open} aria-pressed={!!story} onClick={toggle}>
        <div style={{ flexShrink: 0, width: 72, height: 72, borderRadius: 12, background: "#FDECE8", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexGrow: 1 }}>
          <div className="choice-title display">{story ? `オリジナル「${story.title}」` : "オリジナルのお話をつくる"}</div>
          <div className="choice-desc">あらすじを書くと、AIが12ページのお話にします。ペットやおばあちゃんなども、写真から登場させられます。{open && !story && "お話ができると、次へ進めます。"}</div>
        </div>
        <Chevron dir={open ? "up" : "down"} size={18} />
      </button>}
      {open && (
        <div className="card" style={{ gap: 12 }}>
          <div className="field">
            <span className="display" style={{ fontWeight: 800, color: "var(--navy)" }}>ほかの登場人物（任意・{MAX_CAST}人まで）</span>
            <span style={{ fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
              ママ・パパ以外に登場させたい人やペットの名前を入れてください。次の写真の画面で、それぞれの写真を選べます。
            </span>
            {castRows.map((c, i) => (
              <div key={i} className="cast-row">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    aria-label={`${i + 1}人目の名前`}
                    placeholder="名前（例：コロ）"
                    maxLength={CAST_NAME_MAX}
                    value={c.name}
                    onChange={(e) => setRow(i, { name: [...e.target.value].slice(0, CAST_NAME_MAX).join("") })}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <div role="radiogroup" aria-label={`${i + 1}人目の種類`} style={{ display: "flex", gap: 4 }}>
                    {(Object.keys(CAST_KIND_LABEL) as CastKind[]).map((k) => (
                      <button key={k} type="button" role="radio" aria-checked={c.kind === k} className="cast-kind" onClick={() => setRow(i, { kind: k })}>
                        {CAST_KIND_LABEL[k]}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    aria-label={`${i + 1}人目はどんな人・動物か`}
                    placeholder={c.kind === "animal" ? "どんな動物か（例：うちの犬・ミニチュアシュナウザー）" : "どんな人か（例：おばあちゃん）"}
                    maxLength={CAST_ABOUT_MAX}
                    value={c.about}
                    onChange={(e) => setRow(i, { about: [...e.target.value].slice(0, CAST_ABOUT_MAX).join("") })}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <button type="button" className="ghost" aria-label={`${i + 1}人目をはずす`} style={{ height: 40, padding: "0 12px", fontSize: 13 }} onClick={() => setCast(castRows.filter((_, j) => j !== i))}>
                    はずす
                  </button>
                </div>
              </div>
            ))}
            {castRows.length < MAX_CAST && (
              <button type="button" className="ghost" style={{ alignSelf: "flex-start", height: 40, padding: "0 16px", fontSize: 14 }} onClick={() => setCast([...castRows, { name: "", kind: "animal", about: "" }])}>
                ＋ 登場人物を追加
              </button>
            )}
            {castChanged && <p className="info-note" style={{ fontSize: 13 }}>登場人物を変えたときは、下のボタンでお話を作り直してください。</p>}
          </div>
          <div className="field">
            <label htmlFor="synopsis" className="display">あらすじ（{SYNOPSIS_MAX}文字まで）</label>
            <textarea
              id="synopsis"
              rows={6}
              maxLength={SYNOPSIS_MAX}
              value={synopsis}
              placeholder="例：夏休みに、いなかのおじいちゃんの家へ遊びに行く。おじいちゃんが玄関で出むかえてくれて、いっしょに川で魚つり。去年天国へ行った犬のコロのことを思い出して、夜は星を見ながらコロの話をする。（だれの家か・どこで何をするか・もういない人や動物など、くわしく書くほど絵が正確になります）"
              onChange={(e) => {
                setSynopsis([...e.target.value].slice(0, SYNOPSIS_MAX).join(""));
                setQuestions(null);
              }}
              style={textareaStyle}
            />
            <span style={{ alignSelf: "flex-end", fontSize: 12, color: "var(--sub)" }}>{[...synopsis].length} / {SYNOPSIS_MAX}</span>
          </div>
          <div className="field">
            <span className="display" style={{ fontWeight: 800, color: "var(--navy)" }}>文の量</span>
            <div className="level-row" role="radiogroup" aria-label="オリジナルのお話の文の量">
              {LEVELS.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={level === l.id} className="choice level-choice" onClick={() => setLevel(l.id)}>
                  <span className="choice-title display">{l.name}</span>
                  <span className="tag">{l.ages}</span>
                  <span className="choice-desc" style={{ fontSize: 12 }}>{l.note}</span>
                </button>
              ))}
            </div>
          </div>
          {!nameOk || !ageOk ? (
            <p className="info-note" style={{ fontSize: 13 }}>下の「主人公の名前」と「年齢」を先に入れてください。お話の中に名前が入ります。</p>
          ) : null}
          {questions ? (
            <div className="card" style={{ gap: 10, background: "#FBF7F0" }}>
              <div className="display" style={{ fontSize: 15, fontWeight: 800, color: "var(--navy)" }}>お話を作る前に、AIから質問です</div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
                答えると、絵が本文と食い違いにくくなります（分からない質問は空欄のままで大丈夫です）。
              </div>
              {questions.map((q, i) => (
                <div key={i} className="field">
                  <label htmlFor={`story-q-${i}`} style={{ fontSize: 14 }}>{q}</label>
                  <input
                    id={`story-q-${i}`}
                    type="text"
                    maxLength={ANSWER_MAX}
                    value={answers[i] ?? ""}
                    onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? [...e.target.value].slice(0, ANSWER_MAX).join("") : a)))}
                  />
                </div>
              ))}
              <button type="button" className="cta" disabled={!!busy} onClick={() => generate(questions.map((q, i) => ({ q, a: answers[i]?.trim() ?? "" })))}>
                {busy === "writing" ? "お話を書いています…" : "答えてお話を作る"}
              </button>
              <button type="button" className="ghost" disabled={!!busy} onClick={() => generate([])}>
                質問に答えずに作る
              </button>
              <button type="button" className="ghost" disabled={!!busy} style={{ height: 40, fontSize: 13 }} onClick={() => setQuestions(null)}>
                あらすじを書き直す
              </button>
            </div>
          ) : (
            <button type="button" className="cta" disabled={!!busy || !synopsis.trim() || !nameOk || !ageOk || !castOk} onClick={ask}>
              {busy === "asking" ? "あらすじを読んでいます…" : busy ? "お話を書いています…" : story ? "このあらすじで作り直す" : "AIにお話を作ってもらう"}
            </button>
          )}
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
            無料会員の方が使えます（1日10回まで・プレビューの枚数は減りません）。作り直すと、直した文は新しいお話に置きかわります。
          </p>
          {busy && (
            <DrawingWait
              key={busy}
              title={busy === "asking" ? "あらすじを読んでいます" : "お話を書いています"}
              messages={busy === "asking" ? ["あらすじを よんでいます", "わからない ところを さがしています"] : ["ばめんを かんがえています", "ことばを えらんでいます", "ページを ならべています", "さいごの ページを かいています"]}
              estimate={busy === "asking" ? 10 : 30}
            />
          )}
          {error && <p className="error" role="alert">{error}</p>}
          {needLogin && <Link href={loginHref("/create/story")} className="ghost">無料会員登録・ログインへ</Link>}

          {story && !busy && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="divider" />
              <div className="display" style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>できたお話（自由に直せます）</div>
              {story.cast.length > 0 && (
                <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--sub)" }}>登場人物：{story.cast.map(castLabel).join("、")}</div>
              )}
              <div className="field">
                <label htmlFor="custom-title">題名（{CUSTOM_TITLE_MAX}文字まで）</label>
                <input
                  id="custom-title"
                  type="text"
                  maxLength={CUSTOM_TITLE_MAX}
                  value={story.title}
                  onChange={(e) => save({ ...story, title: [...e.target.value].slice(0, CUSTOM_TITLE_MAX).join("") })}
                />
              </div>
              {story.scenes.map((sc, i) => (
                <div key={i} className="field">
                  <label htmlFor={`custom-page-${i}`}>{i + 1}ページめ</label>
                  <textarea
                    id={`custom-page-${i}`}
                    rows={story.level === "s" ? 2 : story.level === "n" ? 3 : 5}
                    maxLength={CUSTOM_TEXT_MAX}
                    value={sc.text}
                    onChange={(e) =>
                      save({ ...story, scenes: story.scenes.map((x, j) => (j === i ? { ...x, text: [...e.target.value].slice(0, CUSTOM_TEXT_MAX).join("") } : x)) })
                    }
                    style={textareaStyle}
                  />
                  {!sc.text.trim() && <p className="error" style={{ fontSize: 12, padding: "6px 10px" }}>文を入れてください</p>}
                </div>
              ))}
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: "var(--sub)" }}>
                絵はお話を作ったときの場面の内容で描きます（文を大きく変えても、絵の場面は変わりません）。
                {story.level === "l" && "漢字のふりがなは 漢字《かんじ》 の形で書くと、本ではふりがなになります。"}
                主人公の名前を変えたときは、文の中の名前も直してください。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
