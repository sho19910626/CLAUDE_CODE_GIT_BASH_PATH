import type { Metadata } from "next";
import { Suspense } from "react";
import ReportSheet from "@/components/ReportSheet";

export const metadata: Metadata = { title: "報告シート — 営業・売上管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense>
      <ReportSheet />
    </Suspense>
  );
}
