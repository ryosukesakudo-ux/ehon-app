// YouTube ショートの台本（オリジナルキャラ「おちばの したの まち」）。
// 1本＝約15秒＝動画AIの8秒クリップ×2。各話1話完結、1本に出るキャラは1体（2026-10-17 作道さん決定）。
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
        scene: "夜の落ち葉の上。どんぐりのドアップ、目を閉じて歯がカチカチ → 目が開き、帽子がパカッと持ち上がって歯2列がギラッ。根っこで立ち上がりカメラに寄る → 足元の小石をガブッ、ガキン！ 目がぐるぐる",
        sound: "SE: カチカチ／ギギッ／ガキンッ　ガジリ「かじっていい？」「……いたい」",
        frame:
          "Night on the forest floor among damp fallen leaves, dark blue night background. Close-up of the acorn character lying on the leaves with its eyes closed and its cap shut, teeth just visible along the rim. A small grey pebble lies right in front of it. Vertical composition with the character in the lower two thirds.",
        motion:
          "The acorn character's eyes snap open. Its cap lifts like a lid revealing two rows of teeth as it says in a quick, slightly high voice in Japanese 'kajitte ii?'. It stands up on its root legs, scuttles toward the camera, grabs the pebble with its roots and shoves it into its mouth. Close-up: both rows of teeth clamp down hard on the pebble, the teeth visibly grind and scrape against the stone, grit sprays out, the pebble does not break, and the whole body shudders from the effort. Then it recoils dizzy with its cap askew and mutters 'itai'. Sound: soft teeth clicking, a creak when the cap opens, then a loud hard crunch and grinding of teeth on stone. Gentle handheld camera, no cuts.",
      },
      {
        id: "b",
        scene: "朝。もとの場所で目を閉じ「ただのどんぐり」のふり。子どもの手（顔なし）が拾い上げる → 手のひらの上でじっ……歯が小さくカチカチ、目がうっすら開いて小声で「かじっていい？」 子「え？」",
        sound: "SE: 鳥の声／カチ……カチ……　子「どんぐり みっけ」　ガジリ（小声）「……かじっていい？」　子「え？」",
        frame:
          "Morning on the forest floor, soft warm daylight, fallen leaves. The acorn character lies still with its eyes closed and cap shut, pretending to be an ordinary acorn. A small child's hand (only the hand and sleeve, no face) is reaching down toward it from the top of the frame. Vertical composition.",
        motion:
          "The child's hand picks up the acorn and holds it in an open palm filling the lower frame; a child's voice says cheerfully in Japanese 'donguri mikke'. The acorn stays perfectly still, then its teeth begin to click very quietly, one eye opens a crack, and it whispers 'kajitte ii?'. The child's voice says 'e?'. Sound: morning birds, faint teeth clicks. Camera slowly pushes in on the acorn, no cuts. The child's face is never shown.",
      },
    ],
  },
];

// 全クリップ共通の指示（2026-10-18 1本目の試作の感想から: 吹き出しが出る・声が機械っぽい・噛んだ感が弱い）
export const SHORT_PROMPT_RULES = [
  "Animation style: the character must look exactly like the reference character sheet in every frame, including when its face moves: two small round black dot eyes, a tight row of small human-like teeth along the cap rim, and a second row of teeth inside when the cap lifts. Keep the same colors, textures and proportions throughout.",
  "Voice: a warm, natural, slightly hoarse small-creature voice, like a child character in a hand-made stop-motion film. Not robotic, not synthetic, no echo. Dialogue is spoken out loud only.",
  "Do not show speech bubbles, captions, subtitles, letters or any text on screen. No on-screen graphics.",
].join(" ");

export const SHORT_NEGATIVE_PROMPT =
  "speech bubble, text, caption, subtitle, letters, watermark, logo, robotic voice, synthesized voice, autotune, extra characters, human face, cartoon outline style change";

export function getShort(id: string) {
  return SHORTS.find((s) => s.id === id) ?? null;
}

// 絵と動画の置き場所（公開ストレージ samples）
export function shortFramePath(shortId: string, clipId: string) {
  return `shorts/${shortId}/${clipId}/frame.png`;
}

export function shortVideoPath(shortId: string, clipId: string) {
  return `shorts/${shortId}/${clipId}/video.mp4`;
}

export type VeoQuality = "fast" | "standard";
