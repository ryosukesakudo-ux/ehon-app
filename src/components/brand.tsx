/** サイトのロゴ（2026-10-10 決定のA案：コーラルの「絵」マーク＋「絵本 / Only Yours」） */
export const SITE_NAME = "絵本 Only Yours";

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="display"
      style={{ position: "relative", flexShrink: 0, width: size, height: size, borderRadius: size * 0.28, background: "var(--coral)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.5, fontWeight: 900 }}
    >
      絵
      <svg width={size * 0.34} height={size * 0.34} viewBox="0 0 24 24" style={{ position: "absolute", right: -size * 0.1, top: -size * 0.1 }}>
        <path d="M12 2l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17l-6 3.3 1.3-6.7-5-4.6 6.8-.8z" fill="var(--yellow)" />
      </svg>
    </span>
  );
}

/** マーク＋2段の名前。mark=false で文字だけ（注文フローの上部など） */
export function Brand({ size = 34, mark = true }: { size?: number; mark?: boolean }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: size * 0.26 }} aria-label={SITE_NAME}>
      {mark && <BrandMark size={size} />}
      <span aria-hidden="true" style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span className="display" style={{ fontSize: size * 0.5, fontWeight: 900, color: "var(--navy)" }}>絵本</span>
        <span className="script" style={{ fontSize: size * 0.4, color: "var(--coral)", marginTop: size * 0.04 }}>Only Yours</span>
      </span>
    </span>
  );
}
