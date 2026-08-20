import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import type { Metadata } from "next";
import AccountStudio from "@/components/AccountStudio";

export const metadata: Metadata = {
  title: "採用アカウント構築スタジオ | Instagram採用リッチメニュー構築代行",
  description:
    "ヒアリング内容から、プロフィール・フィード9投稿(3×3グリッド)・ハイライト3種・リール3本を一括で設計します。",
};

// トップページ (/) と同じ画面。以前のURLで開いた人のために残している。
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  // 入口(middleware)でも見ているが、ここでも確かめる。
  // 停止されたアカウントに画面を描かないための二重の確認。
  if (!(await currentUser())) redirect("/login");
  return <AccountStudio />;
}
