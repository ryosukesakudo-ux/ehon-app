"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { samplePublicUrl } from "@/lib/samples";
import { studioFullPath, studioKeyPath, totalSeconds, type StudioCharacter, type StudioShort } from "@/lib/studio";
import { Art, apiGet, errorText, exists, withVersion } from "./_ui";

// ショートの一覧（ホームではキャラごと、キャラのページではそのキャラの分）。1本ごとに絵1を見本に出し、進み具合をバッジで示す（2026-10-19）
export function ShortList({ characterId, shorts: given, characters }: { characterId?: string; shorts?: StudioShort[]; characters?: StudioCharacter[] }) {
  const [shorts, setShorts] = useState<StudioShort[] | null>(given ?? null);
  const [have, setHave] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let list = given;
        if (!list) {
          const r = await apiGet("/api/admin/studio/shorts");
          list = r.shorts as StudioShort[];
        }
        if (characterId) list = list.filter((s) => s.characterId === characterId);
        if (!alive) return;
        setShorts(list);
        const checks = list.map((s) => [`full:${s.id}`, samplePublicUrl(studioFullPath(s.id))] as [string, string | null]);
        const results = await Promise.all(checks.map(async ([k, u]) => [k, await exists(u)] as const));
        if (alive) setHave(Object.fromEntries(results));
      } catch (e) {
        if (alive) setError(errorText(e));
      }
    })();
    return () => { alive = false; };
  }, [characterId, given]);

  if (error) return <p style={{ margin: 0, color: "#c0392b", fontSize: 14 }}>エラー: {error}</p>;
  if (!shorts) return <p style={{ margin: 0, fontSize: 14, color: "#888" }}>読み込み中…</p>;
  if (shorts.length === 0) return <p style={{ margin: 0, fontSize: 14, color: "#888" }}>まだありません。</p>;
  const charName = (id: string | null) => characters?.find((c) => c.id === id)?.name;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
      {shorts.map((s) => (
        <Link key={s.id} href={`/admin/studio/shorts/${s.id}`} style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: 6, padding: 10, border: "1px solid #eee", borderRadius: 12 }}>
          <Art src={withVersion(samplePublicUrl(studioKeyPath(s.id, 1)))} alt={s.title} ratio="2 / 3" />
          <strong style={{ fontSize: 14 }}>{s.title || "（題名なし）"}</strong>
          {!characterId && <span style={{ fontSize: 12, color: "#666" }}>{charName(s.characterId) ?? "（キャラ未選択）"}</span>}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", fontSize: 12 }}>
            <Badge ok={s.segments.every((x) => x.motion)}>台本</Badge>
            <Badge ok={have[`full:${s.id}`]}>完成 {totalSeconds(s)}秒</Badge>
          </div>
          <span style={{ fontSize: 12, color: "#888" }}>{s.createdAt?.slice(0, 10)}</span>
        </Link>
      ))}
    </div>
  );
}

export function Badge({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return <span className="tag" style={{ background: ok ? "#dff3df" : "#f1efe9", color: ok ? "#1f6b2a" : "#999" }}>{ok ? "✓ " : "○ "}{children}</span>;
}
