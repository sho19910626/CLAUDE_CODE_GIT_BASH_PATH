import type { Metadata } from "next";
import IndeedProposalTool from "@/components/IndeedProposalTool";

export const metadata: Metadata = {
  title: "Indeed 提案スタジオ — 棲み分けで採用競争から降りる求人設計",
  description:
    "ヒアリング内容を入力するだけで、棲み分け戦略・職種名・キャッチコピー・撮影指示・Indeed掲載原稿までを一括生成します。アルバイト・パートから正社員まで対応。",
};

export default function IndeedStudioPage() {
  return <IndeedProposalTool />;
}
