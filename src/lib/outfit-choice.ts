import "server-only";
import { readScriptEdits, applyScriptEdits } from "./script-edits";
import { SERIES_DATA, type OutfitChoices } from "./series-data";
import type { OutfitPick, SeriesId } from "./story-key";

// お客様が選ぶ服（ヒーロースーツ・ドレス）。台本まるごとを管理画面で直せるので、いつも直したあとの台本から読む（2026-10-23）

/** そのシリーズの服の選択肢（服を選ばないシリーズは null） */
export async function outfitChoicesOf(id: SeriesId): Promise<OutfitChoices | null> {
  const data = SERIES_DATA[id];
  if (!data) return null;
  return applyScriptEdits(data, await readScriptEdits()).outfitChoices ?? null;
}

/** 選んだ服が正しいか。服を選ぶシリーズでは必ず選ぶ。選ばないシリーズで選んでいたら正しくない */
export async function outfitOk(id: SeriesId, pick: OutfitPick | null) {
  const choices = await outfitChoicesOf(id);
  if (!choices?.types.length) return !pick;
  if (!pick) return false;
  return !!choices.types.find((t) => t.id === pick.type)?.colors.some((c) => c.id === pick.color);
}
