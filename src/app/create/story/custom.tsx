"use client";

import { useState } from "react";
import Link from "next/link";
import { CUSTOM_TEXT_MAX, CUSTOM_TITLE_MAX, SYNOPSIS_MAX, customKey, parseCustomKey, type CustomStory } from "@/lib/custom-story";
import { LEVELS, levelForAge, type LevelId } from "@/lib/story-key";
import { Chevron } from "@/components/icons";
import { Lottie } from "@/components/lottie";
import { useFlow } from "../flow";
import { loginHref } from "../account";

// オリジナルのお話：あらすじを入れるとAIが12ページのお話を作り、文はその場で自由に直せる。

const textareaStyle = { padding: "10px 12px", borderRadius: 12, border: "2px solid #d9cfbd", fontSize: 16, lineHeight: 1.7, fontFamily: "inherit", resize: "vertical" } as const;

export function CustomStoryPanel() {
  const { state, update } = useFlow();
  const story = parseCustomKey(state.story);
  // 開くかどうか（未操作なら、オリジナルのお話を選んでいるときに開く。保存していた入力をあとから読むため）
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? !!story;
  const [synopsis, setSynopsis] = useState("");
  const [level, setLevel] = useState<LevelId>(story?.level ?? levelForAge(state.childAge));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const nameOk = state.childName.trim().length > 0;
  const ageOk = !!state.childAge;

  const save = (s: CustomStory) => update({ story: customKey(s), previews: {}, draftId: null });

  async function generate() {
    setBusy(true);
    setError(null);
    setNeedLogin(false);
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ synopsis, childName: state.childName.trim(), childAge: state.childAge, level }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.story) {
        setNeedLogin(!!json.needLogin);
        throw new Error(json.error ?? "お話を作れませんでした");
      }
      save(json.story);
    } catch (e) {
      setError(e instanceof Error ? e.message : "お話を作れませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button type="button" className="choice" aria-expanded={open} aria-pressed={!!story} onClick={() => setToggled(!open)}>
        <div style={{ flexShrink: 0, width: 72, height: 72, borderRadius: 12, background: "#FDECE8", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexGrow: 1 }}>
          <div className="choice-title display">{story ? `オリジナル「${story.title}」` : "オリジナルのお話をつくる"}</div>
          <div className="choice-desc">あらすじを書くと、AIが12ページのお話にします。文はあとから自由に直せます。</div>
        </div>
        <Chevron dir={open ? "up" : "down"} size={18} />
      </button>
      {open && (
        <div className="card" style={{ gap: 12 }}>
          <div className="field">
            <label htmlFor="synopsis" className="display">あらすじ（{SYNOPSIS_MAX}文字まで）</label>
            <textarea
              id="synopsis"
              rows={3}
              maxLength={SYNOPSIS_MAX}
              value={synopsis}
              placeholder="例：うちの犬のコロと、雲の上のおかしの国へ冒険に行く。最後はママとパパにおみやげを持って帰る。"
              onChange={(e) => setSynopsis([...e.target.value].slice(0, SYNOPSIS_MAX).join(""))}
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
          <button type="button" className="cta" disabled={busy || !synopsis.trim() || !nameOk || !ageOk} onClick={generate}>
            {busy ? "お話を書いています…" : story ? "このあらすじで作り直す" : "AIにお話を作ってもらう"}
          </button>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>
            無料会員の方が使えます（1日10回まで・プレビューの枚数は減りません）。作り直すと、直した文は新しいお話に置きかわります。
          </p>
          {busy && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontSize: 13, color: "var(--sub)" }}>
              <Lottie name="drawing" style={{ width: 160, height: 120 }} />
              <span>30秒ほどかかります</span>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          {needLogin && <Link href={loginHref("/create/story")} className="ghost">無料会員登録・ログインへ</Link>}

          {story && !busy && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="divider" />
              <div className="display" style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>できたお話（自由に直せます）</div>
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
