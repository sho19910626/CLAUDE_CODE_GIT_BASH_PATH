import Link from "next/link";
import { currentUser } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

// 画面右上に「◯◯ さん / (管理者) / ログアウト」を出すだけの帯。
// 未ログイン(ログイン画面など)では何も出さない。
export default async function SessionBar() {
  const user = await currentUser();
  if (!user) return null;
  return (
    <div className="session-bar">
      <span>
        {user.name} さん{user.role === "admin" ? "（管理者）" : ""}
      </span>
      {user.role === "admin" && (
        <Link href="/admin" className="session-logout">
          アカウント管理
        </Link>
      )}
      <LogoutButton />
    </div>
  );
}
