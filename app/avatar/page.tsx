import type { Metadata } from "next";
import AvatarStudio from "@/components/AvatarStudio";

export const metadata: Metadata = {
  title: "アバタースタジオ — 顔出し不要のSNS動画を台本だけで量産する",
  description:
    "本人のAIアバターを一度作れば、あとは台本を書くだけ。アバターの設定・完成台本・30日の投稿カレンダー・運用代行の料金プランまでを一括生成します。",
};

export default function AvatarPage() {
  return <AvatarStudio />;
}
