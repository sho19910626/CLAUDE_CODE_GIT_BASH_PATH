import type { Metadata } from "next";
import SettingsPanel from "@/components/SettingsPanel";

export const metadata: Metadata = { title: "設定 — 営業・売上管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <SettingsPanel />;
}
