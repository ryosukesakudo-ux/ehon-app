import type { Metadata, Viewport } from "next";
import { M_PLUS_Rounded_1c, Pacifico, Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";

const display = M_PLUS_Rounded_1c({
  weight: ["800", "900"],
  subsets: ["latin"],
  variable: "--font-display",
  preload: false,
});

// ロゴの「Only Yours」
const script = Pacifico({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-script",
});

const body = Zen_Maru_Gothic({
  weight: ["500", "700"],
  subsets: ["latin"],
  variable: "--font-body",
  preload: false,
});

export const metadata: Metadata = {
  title: "絵本 Only Yours | わが子が主人公の絵本をつくろう",
  description:
    "写真を1枚えらぶだけ。お子さまやママが登場する絵本を、AIがその子のためだけに描きます。製本してご自宅にお届けします。",
};

export const viewport: Viewport = {
  themeColor: "#BFE0F5",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${display.variable} ${script.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
