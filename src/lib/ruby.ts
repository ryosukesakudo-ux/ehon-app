// 本文の 漢字《かな》 のふりがなを読み分ける（入稿用PDFとプレビュー画面の両方で使う）

/** 1文字、または ふりがな付きの漢字のまとまり */
export type Unit = { base: string; ruby?: string };

const KANJI = /[\u4e00-\u9fff々〆ヶ]/;

export function toUnits(text: string): Unit[] {
  const units: Unit[] = [];
  const re = /《([^》]*)》/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const before = [...text.slice(last, m.index)];
    // 《》の直前に続く漢字が、ふりがなの付く文字
    let k = before.length;
    while (k > 0 && KANJI.test(before[k - 1])) k--;
    for (const ch of before.slice(0, k)) units.push({ base: ch });
    const base = before.slice(k).join("");
    if (base) units.push({ base, ruby: m[1] });
    else units.push(...[...m[1]].map((ch) => ({ base: ch })));
    last = m.index + m[0].length;
  }
  for (const ch of text.slice(last)) units.push({ base: ch });
  return units;
}
