import type { Metadata } from "next";
import "./globals.css";
import SessionBar from "@/components/SessionBar";

export const metadata: Metadata = {
  title: "商談ナビ — DFA Robotics 活動報告ジェネレーター",
  description:
    "議事録を貼るだけで、商談準備からPOC評価・稟議支援・内諾までの活動報告を、提出できる形に整えます。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
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
