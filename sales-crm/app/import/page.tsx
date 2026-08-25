import type { Metadata } from "next";
import ImportWizard from "@/components/ImportWizard";

export const metadata: Metadata = { title: "取り込み — 営業・売上管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <ImportWizard />;
}
