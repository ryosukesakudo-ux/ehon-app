import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 入稿用PDFに埋め込むフォント（サーバーの処理から読み込む）
  outputFileTracingIncludes: {
    "/api/admin/orders/*/print": ["./assets/fonts/*.ttf"],
  },
};

export default nextConfig;
