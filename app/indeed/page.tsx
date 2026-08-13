import type { Metadata } from "next";
import IndeedEntry from "@/components/indeed/IndeedEntry";

export const metadata: Metadata = {
  title: "Indeed 求人診断 — 数字を入れると改善策が出ます",
  description:
    "スプレッドシートの記録を貼り付けるか、数字を直接入れるだけで「どこが良くないか」「どうすればいいか」を出します。企業・業種・職種ごとに学習して精度が上がります。",
};

export default function IndeedPage() {
  return <IndeedEntry />;
}
