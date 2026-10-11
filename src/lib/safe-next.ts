// ログイン後の戻り先は、このサイトの中のページだけにする。
// 「//evil.com」や「/\evil.com」のように、ほかのサイトへ飛ばされる書き方は受け付けない。
export function safeNext(next: unknown, fallback = "/account") {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || /[\\\x00-\x1f]/.test(next)) return fallback;
  return new URL(next, "https://x.invalid").origin === "https://x.invalid" ? next : fallback;
}
