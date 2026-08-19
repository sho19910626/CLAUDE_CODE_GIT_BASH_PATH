import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Indeed 運用代行ツール",
  description:
    "営業リストから掲載原稿、掲載後の数字の分析まで。Indeed 運用代行の仕事を1つのサイトにまとめています。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=Shippori+Mincho+B1:wght@400;600;800&family=Zen+Maru+Gothic:wght@400;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
