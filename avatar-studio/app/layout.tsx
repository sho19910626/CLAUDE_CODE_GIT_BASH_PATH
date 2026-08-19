import type { Metadata } from "next";
import "./globals.css";
import SessionBar from "@/components/SessionBar";

export const metadata: Metadata = {
  title: "アバタースタジオ — 顔出し不要のSNS動画を台本だけで量産する",
  description:
    "本人のAIアバターを一度作れば、あとは台本を書くだけ。アバターの設定・完成台本・30日の投稿カレンダー・運用代行の料金プランまでを一括生成します。",
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
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap"
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
