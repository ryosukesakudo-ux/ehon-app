import type { NextConfig } from "next";

// 作例の絵（Supabase の公開ストレージ samples）だけを画像最適化の対象にする
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;

const nextConfig: NextConfig = {
  // 入稿用PDFに埋め込むフォント（サーバーの処理から読み込む）
  outputFileTracingIncludes: {
    "/api/admin/orders/*/print": ["./assets/fonts/*.ttf"],
  },
  images: {
    remotePatterns: supabaseUrl
      ? [{ protocol: "https", hostname: supabaseUrl.hostname, pathname: "/storage/v1/object/public/samples/**" }]
      : [],
    // 最適化した絵を1日キャッシュする（作例を作り直したときも、遅くとも翌日には新しい絵になる）
    minimumCacheTTL: 86400,
  },
};

export default nextConfig;
