import type { Metadata } from "next";
import IndeedEntry from "@/components/indeed/IndeedEntry";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/indeed/server/auth";

export const metadata: Metadata = {
  title: "Indeed 求人診断 — 数字を入れると改善策が出ます",
  description:
    "スプレッドシートの記録を貼り付けるか、数字を直接入れるだけで「どこが良くないか」「どうすればいいか」を出します。企業・業種・職種ごとに学習して精度が上がります。",
};

export const dynamic = "force-dynamic";

export default async function IndeedPage() {
  // 入口(middleware)でも見ているが、ここでも確かめる。
  // 停止されたアカウントに画面を描かないための二重の確認。
  if (!(await currentUser())) redirect("/login");
  return <IndeedEntry />;
}
