import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import Nav, { type NavItem } from "@/components/Nav";
import LogoutButton from "@/components/LogoutButton";
import { currentSession } from "@/lib/auth";
import { countDueTasks } from "@/lib/crm";

export const metadata: Metadata = {
  title: "営業・売上管理",
  description: "取引先・商談・活動・売上・目標を1か所で管理します。",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // ログイン前(ログイン画面)では左の行き先を出さない。
  // データベースに繋がらないときも、ここで落ちずにログイン画面へ進ませる。
  let session = null;
  let overdue = 0;
  try {
    session = await currentSession();
    if (session) overdue = await countDueTasks(session.org.id);
  } catch {
    session = null;
  }

  const items: NavItem[] = [
    { href: "/", label: "ダッシュボード", icon: "◧" },
    { href: "/deals", label: "商談", icon: "◆" },
    { href: "/companies", label: "取引先", icon: "▣" },
    { href: "/revenues", label: "売上", icon: "¥" },
    { href: "/reports", label: "運用実績", icon: "▦" },
    { href: "/tasks", label: "やること", icon: "✓", badge: overdue },
  ];

  return (
    <html lang="ja">
      <body>
        {session ? (
          <div className="shell">
            <nav className="side">
              <div className="brand">
                営業・売上管理
                <small>{session.org.name}</small>
              </div>
              <Nav items={items} />
              <div className="nav-sep">設定</div>
              <Nav
                items={[
                  { href: "/import", label: "取り込み", icon: "↧" },
                  { href: "/settings", label: "ステージ・商材・目標", icon: "⚙" },
                  ...(session.user.role === "admin"
                    ? [{ href: "/admin", label: "アカウント管理", icon: "☖" }]
                    : []),
                  ...(session.user.role === "admin" && session.org.isOwner
                    ? [{ href: "/orgs", label: "導入先の会社", icon: "▤" }]
                    : []),
                ]}
              />
              <div className="session-bar">
                <span>
                  {session.user.name} さん
                  {session.user.role === "admin" ? "（管理者）" : ""}
                </span>
                <LogoutButton />
              </div>
            </nav>
            <main className="main">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
