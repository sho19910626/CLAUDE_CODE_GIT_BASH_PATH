import type { Metadata } from "next";
import QuickAnalyzer from "@/components/indeed/QuickAnalyzer";

export const metadata: Metadata = {
  title: "Indeed 求人診断 — 数字を入れると改善策が出ます",
  description:
    "表示数・クリック数・応募数を入力すると、同じ業種・雇用形態の水準と比べて「どこが良くないか」「どうすればいいか」をその場で出します。登録も保存も不要です。",
};

export default function IndeedPage() {
  return <QuickAnalyzer />;
}
