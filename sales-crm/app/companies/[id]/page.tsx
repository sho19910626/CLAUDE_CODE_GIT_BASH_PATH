import type { Metadata } from "next";
import CompanyDetail from "@/components/CompanyDetail";

export const metadata: Metadata = { title: "取引先 — 営業・売上管理" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompanyDetail companyId={id} />;
}
