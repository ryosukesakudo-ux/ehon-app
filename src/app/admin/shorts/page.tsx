"use client";

import { useEffect, useRef, useState } from "react";
import { ORIGINAL_CHARACTERS } from "@/lib/characters";
import { samplePublicUrl } from "@/lib/samples";
import { SERIES_NOTE_MAX } from "@/lib/series";
import { SHORTS, shortFramePath, shortVideoPath, type Short, type ShortClip, type VeoQuality } from "@/lib/shorts";

// 開いた時刻を版にして、作り直した絵・動画の古いキャッシュを避ける
const OPENED_AT = typeof window === "undefined" ? 0 : Date.now();

// ショートスタジオ：台本のクリップごとに「最初のコマの絵」を作り、Veo 3.1 で8秒の動画にする。お客様の画面には出ない
export default function ShortsPage() {
  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <a href="/admin">← 注文管理へ</a>
      <h1 className="display" style={{ margin: 0, color: "var(--navy)" }}>ショートスタジオ</h1>
      <p className="step-lead">
        YouTube ショート（縦長・約15秒）を、8秒のクリップ2本で作ります。クリップごとに ①最初のコマの絵を作る（約25円）→ ②Veo で動かす（Fast 約120円／Standard 約480円、1〜6分）。
        絵と動画は保存され、作り直すと上書きされます。先にキャラスタジオで設定画を作っておいてください。
      </p>
      {SHORTS.map((s) => <ShortCard key={s.id} short={s} />)}
    </main>
  );
}

function ShortCard({ short }: { short: Short }) {
  const c = ORIGINAL_CHARACTERS.find((x) => x.id === short.character);
  return (
    <section className="card" style={{ gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
        <strong style={{ fontSize: 20 }}>「{short.title}」</strong>
        <span className="tag">{c?.name ?? short.character} だけ</span>
        <span className="tag">約15秒</span>
      </div>
      {short.clips.map((clip, i) => <ClipCard key={clip.id} short={short} clip={clip} index={i} />)}
    </section>
  );
}

function ClipCard({ short, clip, index }: { short: Short; clip: ShortClip; index: number }) {
  const [frame, setFrame] = useState<string | null>(() => withVersion(samplePublicUrl(shortFramePath(short.id, clip.id))));
  const [video, setVideo] = useState<string | null>(() => withVersion(samplePublicUrl(shortVideoPath(short.id, clip.id))));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"frame" | "video" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Veo の operation 名を localStorage に覚えておき、リロードしても確認を続ける
  const storeKey = `ehon-short-op:${short.id}:${clip.id}`;
  useEffect(() => {
    const saved = readStore(storeKey);
    if (saved) {
      // 表示が出てから続きを確認する（effect の中で直接 setState しない）
      timer.current = setTimeout(() => {
        setBusy("video");
        setStatus("Veo で作成中…（リロード前の続きを確認しています）");
        watch(saved.operation, saved.started);
      }, 0);
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 開いたときに1回だけ
  }, []);

  function watch(operation: string, started: number) {
    const poll = async () => {
      try {
        const q = new URLSearchParams({ operation, shortId: short.id, clipId: clip.id });
        const res = await fetch(`/api/admin/shorts?${q}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `失敗しました (${res.status})`);
        if (json.done) {
          writeStore(storeKey, null);
          setVideo(json.url);
          setStatus(`動画ができました（${Math.round((Date.now() - started) / 1000)}秒）`);
          setBusy(null);
          return;
        }
        setStatus(`Veo で作成中…（${Math.round((Date.now() - started) / 1000)}秒経過。この画面を閉じたりリロードしても続きます）`);
        timer.current = setTimeout(poll, 10000);
      } catch (e) {
        writeStore(storeKey, null);
        setError(e instanceof Error ? e.message : "失敗しました");
        setStatus(null);
        setBusy(null);
      }
    };
    timer.current = setTimeout(poll, 10000);
  }

  async function makeFrame() {
    setBusy("frame");
    setError(null);
    setStatus("絵を作成中…（1〜2分）");
    try {
      const json = await post({ shortId: short.id, clipId: clip.id, kind: "frame", note });
      setFrame(json.url);
      setStatus(`絵ができました（${json.seconds}秒）`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
      setStatus(null);
    } finally {
      setBusy(null);
    }
  }

  async function makeVideo(quality: VeoQuality) {
    setBusy("video");
    setError(null);
    setStatus(`Veo（${quality === "fast" ? "Fast" : "Standard"}）で動画を作成中…（1〜6分）`);
    try {
      const { operation } = await post({ shortId: short.id, clipId: clip.id, kind: "video", quality, note });
      const started = Date.now();
      writeStore(storeKey, { operation, started });
      watch(operation, started);
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
      setStatus(null);
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12, borderTop: index > 0 ? "1px solid #eee" : undefined }}>
      <strong>クリップ {clip.id.toUpperCase()}（{index * 8}〜{index * 8 + 8}秒）</strong>
      <div style={{ fontSize: 14, lineHeight: 1.7 }}>
        <div><span style={{ color: "#666" }}>場面：</span>{clip.scene}</div>
        <div><span style={{ color: "#666" }}>音・セリフ：</span>{clip.sound}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 560 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#666" }}>① 最初のコマの絵</span>
          <Frame src={frame} alt={`クリップ${clip.id}の絵`} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#666" }}>② 動画（8秒・音つき）</span>
          <Video src={video} />
        </div>
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
        追加の指示（任意・日本語でOK。次に作る1つにだけ効きます）
        <textarea value={note} maxLength={SERIES_NOTE_MAX} rows={2} onChange={(e) => setNote(e.target.value)} placeholder="例：もっと暗く、歯をもっと大きく動かす" />
      </label>
      {/* 結果はボタンの上に出す（下だと画面の外になって気づけない） */}
      {status && <p style={{ margin: 0, fontSize: 14, color: "#4f6f9f" }}>{status}</p>}
      {error && <p style={{ margin: 0, color: "#c0392b", fontWeight: 700 }}>エラー: {error}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="cta" onClick={makeFrame} disabled={busy !== null}>
          {busy === "frame" ? "作成中…" : "① 絵を作る"}
        </button>
        <button type="button" className="cta yellow" onClick={() => makeVideo("fast")} disabled={busy !== null}>
          {busy === "video" ? "作成中…" : "② Fast で動かす（約120円）"}
        </button>
        <button type="button" className="cta yellow" onClick={() => makeVideo("standard")} disabled={busy !== null}>
          {busy === "video" ? "作成中…" : "② Standard で動かす（約480円）"}
        </button>
      </div>
    </div>
  );
}

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/shorts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `失敗しました (${res.status})`);
  return json;
}

type StoredOp = { operation: string; started: number };
function readStore(key: string): StoredOp | null {
  try {
    const raw = localStorage.getItem(key);
    const v = raw && JSON.parse(raw);
    // 1時間以上前のものは諦める（Veo 側で消えている）
    if (v && typeof v.operation === "string" && typeof v.started === "number" && Date.now() - v.started < 60 * 60 * 1000) return v;
  } catch {}
  return null;
}
function writeStore(key: string, v: StoredOp | null) {
  try {
    if (v) localStorage.setItem(key, JSON.stringify(v));
    else localStorage.removeItem(key);
  } catch {}
}

function withVersion(url: string | null) {
  return url && `${url}?v=${OPENED_AT}`;
}

// 保存された絵。まだ無いときは「未作成」
function Frame({ src, alt }: { src: string | null; alt: string }) {
  const [missing, setMissing] = useState(false);
  if (!src || missing) return <Empty>{src ? "未作成" : "Supabase 未設定"}</Empty>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 作った絵をそのまま表示
    <img key={src} src={src} alt={alt} onError={() => setMissing(true)} style={{ width: "100%", borderRadius: 12 }} />
  );
}

// 保存された動画。まだ無いときは「未作成」
function Video({ src }: { src: string | null }) {
  const [missing, setMissing] = useState(false);
  if (!src || missing) return <Empty>{src ? "未作成" : "Supabase 未設定"}</Empty>;
  return <video key={src} src={src} controls playsInline onError={() => setMissing(true)} style={{ width: "100%", borderRadius: 12, background: "#000" }} />;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ aspectRatio: "9 / 16", borderRadius: 12, background: "#f1efe9", display: "grid", placeItems: "center", color: "#888", fontSize: 13 }}>{children}</div>;
}
