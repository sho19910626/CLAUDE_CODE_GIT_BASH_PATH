import type { Metadata } from "next";
import IndeedApp from "@/components/indeed/IndeedApp";

export const metadata: Metadata = {
  title: "Indeed 求人診断(記録して学習させる版)",
  description:
    "求人ごとに実績を積み上げ、施策の効果を測定して提案の精度を上げていく版です。比較基準も提案の並び順も、入力するほど自分のデータに置き換わります。",
};

export default function IndeedManagePage() {
  return <IndeedApp />;
}
