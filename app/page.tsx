import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Indeed 運用代行ツール",
  description:
    "営業リストから掲載原稿、掲載後の数字の分析まで。Indeed 運用代行の仕事を1つのサイトにまとめています。",
};

// トップは入口だけを置く。
//
// 3 つのツールは「営業 → 提案 → 分析」という仕事の順番で並んでいる。
// どれから入っても行き来できるよう、各ツールの画面上部にも相互リンクがある。
const TOOLS = [
  {
    href: "/console.html",
    step: "① 営業",
    name: "フォーム営業コンソール",
    body: "通年採用を続けている企業のリストと、企業ごとの営業文面。商談化したら、その場で提案スタジオへ引き継げます。",
    external: true,
  },
  {
    href: "/indeed/studio",
    step: "② 提案",
    name: "Indeed 提案スタジオ",
    body: "ヒアリング内容から、棲み分け戦略・職種名・キャッチコピー・撮影指示・掲載原稿までを一括で作ります。",
    external: false,
  },
  {
    href: "/indeed",
    step: "③ 分析",
    name: "Indeed 求人診断",
    body: "掲載後の表示数・クリック数・応募数を貼り付けると、どこが良くないか・どうすればいいかが出ます。企業ごとに学習します。",
    external: false,
  },
];

export default function Home() {
  return (
    <div className="container idd">
      <div className="header">
        <h1>Indeed 運用代行ツール</h1>
        <span className="sub">営業 → 提案 → 分析 を 1 つのサイトで</span>
      </div>

      <div className="home-grid">
        {TOOLS.map((t) =>
          t.external ? (
            <a key={t.href} href={t.href} className="home-card">
              <span className="home-step">{t.step}</span>
              <strong>{t.name}</strong>
              <p>{t.body}</p>
            </a>
          ) : (
            <Link key={t.href} href={t.href} className="home-card">
              <span className="home-step">{t.step}</span>
              <strong>{t.name}</strong>
              <p>{t.body}</p>
            </Link>
          )
        )}
      </div>
    </div>
  );
}
