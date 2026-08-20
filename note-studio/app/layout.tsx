import type { Metadata } from "next";
import "./globals.css";
import SessionBar from "@/components/SessionBar";

export const metadata: Metadata = {
  title: "note 収益化スタジオ",
  description:
    "noteの競合リサーチ・ジャンル選定・アカウント設計・運用計画・記事作成を一気通貫で行い、有料記事の月商を積み上げるツール。",
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
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <SessionBar />
        {children}
      </body>
    </html>
  );
}
