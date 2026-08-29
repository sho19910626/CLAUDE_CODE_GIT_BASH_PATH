import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";

export const metadata: Metadata = { title: "ダッシュボード — 営業・売上管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <Dashboard />;
}
