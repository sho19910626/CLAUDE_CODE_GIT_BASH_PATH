import type { Metadata } from "next";
import VideoEditor from "@/components/VideoEditor";

export const metadata: Metadata = {
  title: "動画編集スタジオ — 説明動画からショート動画と本編を自動生成",
  description:
    "サービス説明動画をアップロードするだけで、SNS用のショート動画と、商談・サイト掲載用の3〜5分の動画をAIが設計し、テロップ入りのMP4として書き出します。",
};

export default function VideoPage() {
  return <VideoEditor />;
}
