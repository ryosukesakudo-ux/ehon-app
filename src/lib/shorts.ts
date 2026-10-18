// YouTube ショートの台本（オリジナルキャラ「おちばの したの まち」）。
// 1本＝約15秒＝動画AIの8秒クリップ×2。各話1話完結、1本に出るキャラは1体（2026-10-17 作道さん決定）。
// セリフは無し。キャラは言葉を話さず、キャラごとの鳴き声（characters.ts の voice）と動きだけ（2026-10-18 作道さん決定: 発音が気になるため）。
// 台本の原本: /mnt/project-files/characters/shorts/short-01-kajitte-ii.md
// 管理画面の「ショートスタジオ」(/admin/shorts) で、クリップごとに最初のコマの絵を作り、Veo で動かす。

export type ShortClip = {
  id: string;
  /** 画面に出す場面の説明（日本語） */
  scene: string;
  /** セリフ・効果音（日本語） */
  sound: string;
  /** 最初のコマの絵の指示（英語） */
  frame: string;
  /** 最後のコマの絵の指示（英語）。最初と最後を絵で決め、間を Veo がつなぐ（顔を設定画どおりに保つため） */
  lastFrame: string;
  /** 動きと音の指示（英語） */
  motion: string;
};

export type Short = {
  id: string;
  title: string;
  /** 出るキャラ（src/lib/characters.ts の id） */
  character: string;
  clips: ShortClip[];
};

export const SHORTS: Short[] = [
  {
    id: "kajitte-ii",
    title: "かじっていい？",
    character: "gajiri",
    clips: [
      {
        id: "a",
        scene: "夜の落ち葉の上。どんぐりのドアップ、目を開けて小石をじっと見ている、歯がカチカチ → 帽子がパカッと持ち上がって歯2列がギラッ、キュッ！と鳴く。根っこで立ち上がりカメラに寄る → 小石をガブッ、ガリガリ！ 目がぐるぐる、小さく「ギ……」",
        sound: "SE: カチカチ／ギギッ／ガリガリッ　ガジリの鳴き声: キュッ！（かじりたい）→ ギ……（いたい）。言葉は話さない",
        frame:
          "Night on the forest floor among damp fallen leaves, dark blue night background. Close-up of the acorn character sitting on the leaves, wide awake, facing the camera: its two small round black dot eyes are open and fixed on a small grey pebble right in front of it, the cap is slightly lifted so the row of teeth along the cap rim and the second row inside are clearly visible, an eager toothy grin exactly like the happy face on the expression sheet. Vertical composition with the character in the lower two thirds.",
        lastFrame:
          "Same night scene and same camera distance as the opening frame, slightly closer. The acorn character has just bitten the pebble and recoiled: it sits tilted back, dizzy, its cap knocked askew to one side, both rows of teeth bared in a pained grimace, its two small round black dot eyes squeezed into tiny tight slits, a few bits of grit in the air around its mouth. The grey pebble lies in front of it with small white teeth scratches on it. Exactly the same character design as the reference sheets.",
        motion:
          "The acorn character stares at the pebble, its teeth clicking faster and faster. Its cap lifts wider like a lid showing both rows of teeth and it lets out one short eager squeak. It stands up on its root legs, scuttles toward the camera, grabs the pebble with its roots and shoves it into its mouth. Close-up: both rows of teeth clamp down hard on the pebble, the teeth visibly grind and scrape against the stone, grit sprays out, the pebble does not break, and the whole body shudders from the effort. Then it recoils dizzy with its cap askew and gives a small pained creak. Sound: soft teeth clicking, a creak when the cap opens, then a loud hard crunch and grinding of teeth on stone. Gentle handheld camera, no cuts.",
      },
      {
        id: "b",
        scene: "朝。もとの場所で目を閉じ「ただのどんぐり」のふり。子どもの手（顔なし）が拾い上げる → 手のひらの上でじっ……歯が小さくカチカチ、目がうっすら開いて小さく「キュ……？」 子どもの手がビクッ",
        sound: "SE: 鳥の声／カチ……カチ……　ガジリの鳴き声（小さく）: キュ……？　子どもは声を出さない（息をのむ程度）",
        frame:
          "Morning on the forest floor, soft warm daylight, fallen leaves. The acorn character sits still with its cap closed and its eyes narrowed to tiny slits, pretending to be an ordinary acorn; the row of teeth along the cap rim is still visible. A small child's hand (only the hand and sleeve, no face) is reaching down toward it from the top of the frame. Vertical composition.",
        lastFrame:
          "Same morning scene. The child's open palm (only the hand and sleeve, no face) fills the lower half of the frame, holding the acorn character close to the camera. The acorn's cap has opened a crack showing the teeth along the rim and a hint of the second row inside, and its two small round black dot eyes are half open, peeking up guiltily. Exactly the same character design as the reference sheets.",
        motion:
          "The child's hand picks up the acorn and holds it in an open palm filling the lower frame. The acorn stays perfectly still, then its teeth begin to click very quietly, its two small black dot eyes open a crack, and it gives one tiny questioning squeak. The hand flinches slightly. Sound: morning birds, faint teeth clicks, a short surprised intake of breath from the child, no words. Camera slowly pushes in on the acorn, no cuts. The child's face is never shown.",
      },
    ],
  },
];

// 全クリップ共通の指示（2026-10-18 1本目の試作の感想から: 吹き出しが出る・声が機械っぽい・発音がおかしい・噛んだ感が弱い → セリフなし、鳴き声だけ）
export const SHORT_PROMPT_RULES = [
  "Animation style: the character must look exactly like the reference character sheet in every frame, including when its face moves. Keep the same colors, textures and proportions throughout.",
  "The character's face must stay the same design throughout: the eyes are always two small round black dots (never large eyes, never eyelashes, never pupils with highlights), the mouth is always the row of teeth along the cap rim. Its expressions change only by the cap opening or closing, the eyes squinting, and the body posture, as shown on the expression sheet.",
  "No spoken words at all, in any language. Nobody talks. The character only makes wordless animal-like cries and body sounds, like a creature in a hand-made stop-motion film; no human speech, no narration, no singing, no robotic or synthetic voice.",
  "Do not show speech bubbles, captions, subtitles, letters or any text on screen. No on-screen graphics.",
].join(" ");

export const SHORT_NEGATIVE_PROMPT =
  "speech bubble, text, caption, subtitle, letters, watermark, logo, spoken words, dialogue, talking, narration, singing, robotic voice, synthesized voice, extra characters, human face, cartoon outline style change";

export function getShort(id: string) {
  return SHORTS.find((s) => s.id === id) ?? null;
}

// 絵と動画の置き場所（公開ストレージ samples）
export type ShortFrameKind = "first" | "last";

export function shortFramePath(shortId: string, clipId: string, which: ShortFrameKind = "first") {
  return `shorts/${shortId}/${clipId}/${which === "last" ? "last" : "frame"}.png`;
}

export function shortVideoPath(shortId: string, clipId: string) {
  return `shorts/${shortId}/${clipId}/video.mp4`;
}

export type VeoQuality = "fast" | "standard";
