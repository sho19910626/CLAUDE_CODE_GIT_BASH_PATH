import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import Generator from "@/components/Generator";

export const dynamic = "force-dynamic";

export default async function Home() {
  // 入口(middleware)でも見ているが、ここでも確かめる。
  // 停止されたアカウントに画面を描かないための二重の確認。
  if (!(await currentUser())) redirect("/login");
  return <Generator />;
}
