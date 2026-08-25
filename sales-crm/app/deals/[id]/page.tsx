import type { Metadata } from "next";
import DealDetail from "@/components/DealDetail";

export const metadata: Metadata = { title: "商談 — 営業・売上管理" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DealDetail dealId={id} />;
}
