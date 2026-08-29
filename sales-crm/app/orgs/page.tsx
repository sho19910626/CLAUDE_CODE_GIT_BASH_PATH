import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentAdminSession } from "@/lib/auth";
import OrgPanel from "@/components/OrgPanel";

export const metadata: Metadata = { title: "導入先の会社 — 営業・売上管理" };
export const dynamic = "force-dynamic";

export default async function Page() {
  // 運営元の管理者だけ。URL を直接開かれても中身を描かない。
  const session = await currentAdminSession();
  if (!session || !session.org.isOwner) redirect("/");
  return <OrgPanel />;
}
