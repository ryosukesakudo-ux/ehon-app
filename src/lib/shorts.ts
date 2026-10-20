// YouTube ショートの台本の種データと、動画AIへの共通ルール（オリジナルキャラ「おちばの したの まち」）。
// 各話1話完結、1本に出るキャラは1体（2026-10-17 作道さん決定）。
// 2026-10-20 から止め絵方式（止め絵2〜6枚＋絵と絵の間を Veo で4〜8秒ずつ動かしてつなぐ）。ここの SHORTS は以前の形（A 8秒＋B 7秒延長）のままで、
// 取り込むときに studio.ts の fromLegacyClips で止め絵の形に直す。
// セリフは無し。キャラは言葉を話さず、キャラごとの鳴き声（characters.ts の voice）と動きだけ（2026-10-18 作道さん決定: 発音が気になるため）。
// 台本は今はスタジオ（/admin/studio）のデータベースにあり、ここの SHORTS は「取り込む」ための初期データ（2026-10-19）。
// 台本の原本: /mnt/project-files/characters/shorts/short-01-kajitte-ii.md

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
          "Night on the forest floor among damp fallen leaves, dark blue night background. Close-up of the acorn character sitting on the leaves, wide awake, facing the camera, in the same pose as the front view on the design sheet: the cap is lifted a little so the mouth gap between cap and body is open, showing the upper row of teeth on the cap rim, the lower row of teeth on the top edge of the body, and the two small round black dot eyes on the dark inner face between them, fixed on a small grey pebble right in front of it. An eager toothy grin. No mouth or eyes anywhere on the body itself. Vertical composition with the character in the lower two thirds.",
        lastFrame:
          "Same night scene and same camera distance as the opening frame, slightly closer. The acorn character has just bitten the pebble and recoiled: it sits tilted back, dizzy, its cap lifted high and knocked askew to one side so the mouth gap between cap and body is wide open, showing the upper teeth on the cap rim, the lower teeth on the top edge of the body and the dark throat between them; its two small round black dot eyes, on the dark inner face just under the cap rim, are squeezed into tiny tight slits; a few bits of grit are in the air in front of the gap. The body below the lower teeth stays a plain smooth acorn with no second mouth. The grey pebble lies in front of it with small white teeth scratches on it. Exactly the same character design as the open-mouth view on the design sheet.",
        motion:
          "The acorn character stares at the pebble, its teeth clicking faster and faster. Its cap lifts wider like a lid showing both rows of teeth and it lets out one short eager squeak. It stands up on its root legs, scuttles toward the camera, grabs the pebble with its roots and shoves it into its mouth. Close-up: the cap-and-body mouth gap closes on the pebble so the upper teeth on the cap rim and the lower teeth on the body edge clamp down hard on it, the teeth visibly grind and scrape against the stone, grit sprays out, the pebble does not break, and the whole body shudders from the effort. Then it recoils dizzy with its cap askew and gives a small pained creak. Sound: soft teeth clicking, a creak when the cap opens, then a loud hard crunch and grinding of teeth on stone. Gentle handheld camera, no cuts.",
      },
      {
        id: "b",
        scene: "朝。もとの場所で目を閉じ「ただのどんぐり」のふり。子どもの手（顔なし）が拾い上げる → 手のひらの上でじっ……歯が小さくカチカチ、目がうっすら開いて小さく「キュ……？」 子どもの手がビクッ",
        sound: "SE: 鳥の声／カチ……カチ……　ガジリの鳴き声（小さく）: キュ……？　子どもは声を出さない（息をのむ程度）",
        frame:
          "Morning on the forest floor, soft warm daylight, fallen leaves. The acorn character sits still with its cap shut tight so the two rows of teeth meet as one zipped line along the seam and the eyes are hidden, pretending to be an ordinary acorn; no face is visible on the body. A small child's hand (only the hand and sleeve, no face) is reaching down toward it from the top of the frame. Vertical composition.",
        lastFrame:
          "Same morning scene. The child's open palm (only the hand and sleeve, no face) fills the lower half of the frame, holding the acorn character close to the camera. The acorn's cap has lifted a crack so the mouth gap between cap and body is slightly open, showing the upper teeth on the cap rim, the lower teeth on the top edge of the body, and its two small round black dot eyes on the dark inner face between them, half open and peeking up guiltily. No mouth or eyes on the body itself. Exactly the same character design as the reference sheets.",
        motion:
          "The child's hand picks up the acorn and holds it in an open palm filling the lower frame. The acorn stays perfectly still, then its teeth begin to click very quietly, the cap lifts a crack so its two small black dot eyes show in the gap, and it gives one tiny questioning squeak. The hand flinches slightly. Sound: morning birds, faint teeth clicks, a short surprised intake of breath from the child, no words. Camera slowly pushes in on the acorn, no cuts. The child's face is never shown.",
      },
    ],
  },
];

// 全クリップ共通の指示（2026-10-18 1本目の試作の感想から: 吹き出しが出る・声が機械っぽい・発音がおかしい・噛んだ感が弱い → セリフなし、鳴き声だけ）
export const SHORT_PROMPT_RULES = [
  "Animation style: the character must look exactly like the reference character sheet in every frame, including when its face moves. Keep the same colors, textures and proportions throughout.",
  "The character's face and body must stay exactly as described in the character description (FACE ANATOMY) in every frame: the same number and placement of eyes and teeth, the same single mouth. Never add a second mouth, lips, eyes or a creature coming out of the body. Expressions change only in the ways the description allows (for example a lid opening or closing, eyes squinting) and by body posture.",
  "No spoken words at all, in any language. Nobody talks. The character only makes wordless animal-like cries and body sounds, like a creature in a hand-made stop-motion film; no human speech, no narration, no singing, no robotic or synthetic voice.",
  "Do not show speech bubbles, captions, subtitles, letters or any text on screen. No on-screen graphics.",
  // 見せ場が一瞬で流れてしまわないように（2026-10-19 作道さん：小石を歯で挟む瞬間が出ない）
  "Physical actions are slow, deliberate and clearly readable, like stop-motion: at most three actions per clip, and the key action is held on screen for at least two full seconds. When the character grips, bites, clamps or holds an object, the object stays clearly visible in contact the whole time (for example clamped between the upper and lower teeth with half of it sticking out). Objects never vanish, melt, shrink, teleport or get swallowed; they keep their size and shape until the action ends.",
].join(" ");

export const SHORT_NEGATIVE_PROMPT =
  "speech bubble, text, caption, subtitle, letters, watermark, logo, spoken words, dialogue, talking, narration, singing, robotic voice, synthesized voice, extra characters, human face, cartoon outline style change";
