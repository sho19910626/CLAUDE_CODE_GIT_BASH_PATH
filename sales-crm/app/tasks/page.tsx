import type { Metadata } from "next";
import TaskPage from "@/components/TaskPage";

export const metadata: Metadata = { title: "やること — 営業・売上管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <TaskPage />;
}
