import type { Metadata } from "next";
import { Suspense } from "react";
import ReportPanel from "@/components/ReportPanel";

export const metadata: Metadata = { title: "運用実績 — 営業・売上管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense>
      <ReportPanel />
    </Suspense>
  );
}
