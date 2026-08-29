import type { Metadata } from "next";
import DealBoard from "@/components/DealBoard";

export const metadata: Metadata = { title: "商談 — 営業・売上管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <DealBoard />;
}
