import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentAdminSession } from "@/lib/auth";
import AdminPanel from "@/components/AdminPanel";

export const metadata: Metadata = { title: "アカウント管理 — 営業・売上管理" };
export const dynamic = "force-dynamic";

export default async function Page() {
  // 画面を出す前にサーバー側で権限を確かめる。
  // 管理者でない人が URL を直接開いても中身が描かれないようにする。
  if (!(await currentAdminSession())) redirect("/");
  return <AdminPanel />;
}
