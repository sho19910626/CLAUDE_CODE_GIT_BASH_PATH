import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import AdminPanel from "@/components/AdminPanel";

export const metadata: Metadata = {
  title: "アカウント管理 — 採用アカウント構築スタジオ",
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // 画面を出す前にサーバー側で権限を確かめる。
  // 管理者でない人がURLを直接開いても中身が描かれないようにする。
  if (!(await currentAdmin())) redirect("/");
  return <AdminPanel />;
}
