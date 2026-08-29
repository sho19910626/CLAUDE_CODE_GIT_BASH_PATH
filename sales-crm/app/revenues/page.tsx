import type { Metadata } from "next";
import RevenueTable from "@/components/RevenueTable";

export const metadata: Metadata = { title: "売上 — 営業・売上管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <RevenueTable />;
}
