import type { Metadata } from "next";
import ProjectList from "@/components/ProjectList";

export const metadata: Metadata = {
  title: "案件一覧 — note 収益化スタジオ",
};

export const dynamic = "force-dynamic";

export default function Home() {
  return <ProjectList />;
}
