import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import SalesConsole from "@/components/SalesConsole";

export const dynamic = "force-dynamic";

export default async function Home() {
  // 入口(middleware)でも見ているが、ここでも確かめる。
  // 停止されたアカウントに顧客情報の画面を描かないための二重の確認。
  if (!(await currentUser())) redirect("/login");
  return <SalesConsole />;
}
