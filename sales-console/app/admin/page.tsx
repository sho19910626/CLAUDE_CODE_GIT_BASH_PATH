import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import AdminPanel from "@/components/AdminPanel";
import PlaybookPanel from "@/components/PlaybookPanel";

export const metadata: Metadata = {
  title: "アカウント管理 — 商談ナビ",
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // 画面を出す前にサーバー側で権限を確かめる。
  // 管理者でない人がURLを直接開いても中身が描かれないようにする。
  if (!(await currentAdmin())) redirect("/");
  return (
    <>
      <AdminPanel />
      <PlaybookPanel />
    </>
  );
}
