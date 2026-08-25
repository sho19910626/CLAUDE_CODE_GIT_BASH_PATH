import type { Metadata } from "next";
import CompanyList from "@/components/CompanyList";

export const metadata: Metadata = { title: "取引先 — 営業・売上管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <CompanyList />;
}
