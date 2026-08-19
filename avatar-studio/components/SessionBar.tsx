import { currentUser } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

// 画面右上に「◯◯ さん / ログアウト」を出すだけの帯。
// 未ログイン(ログイン画面など)では何も出さない。
export default async function SessionBar() {
  const user = await currentUser();
  if (!user) return null;
  return (
    <div className="session-bar">
      <span>{user} さん</span>
      <LogoutButton />
    </div>
  );
}
