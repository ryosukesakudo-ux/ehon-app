// お届け先のお名前のフリガナ（しまうまの届け先登録にカナが必要。2026-10-19 作道さん）

/** ひらがな・半角カナ・空白のゆれをそろえて全角カタカナにする */
export function toKatakana(s: string) {
  return s
    .normalize("NFKC")
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/\s+/g, "")
    .trim();
}

/** 全角カタカナ（長音・中黒を含む）だけで書かれているか */
export function isKatakana(s: string) {
  return /^[ァ-ヺー・]+$/.test(s);
}

export const KANA_MAX = 30;

/** セイ・メイをそろえて確かめる。どちらかが空・カタカナ以外なら null */
export function parseShippingKana(sei: unknown, mei: unknown): { sei: string; mei: string } | null {
  const a = typeof sei === "string" ? toKatakana(sei).slice(0, KANA_MAX) : "";
  const b = typeof mei === "string" ? toKatakana(mei).slice(0, KANA_MAX) : "";
  return isKatakana(a) && isKatakana(b) ? { sei: a, mei: b } : null;
}
