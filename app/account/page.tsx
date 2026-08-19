import type { Metadata } from "next";
import AccountStudio from "@/components/AccountStudio";

export const metadata: Metadata = {
  title: "採用アカウント構築スタジオ | Instagram採用リッチメニュー構築代行",
  description:
    "ヒアリング内容から、プロフィール・フィード9投稿(3×3グリッド)・ハイライト3種・リール3本を一括で設計します。",
};

export default function AccountPage() {
  return <AccountStudio />;
}
