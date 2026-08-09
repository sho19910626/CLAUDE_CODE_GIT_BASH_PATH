import type { Metadata } from "next";
import IndeedApp from "@/components/indeed/IndeedApp";

export const metadata: Metadata = {
  title: "Indeed 求人診断 — 表示数・クリック数・応募数から改善提案を出す",
  description:
    "Indeed の実績を登録すると、同業種・同職種の求人と比べてファネルのどこが詰まっているかを判定し、改善提案を優先度順に出します。実績と施策の結果を蓄積するほど比較基準と提案精度が上がります。",
};

export default function IndeedPage() {
  return <IndeedApp />;
}
