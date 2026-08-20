// アカウントの発行・停止・権限変更。管理者だけが使える。
//
// 画面側でボタンを隠すだけでは、API を直接叩かれると素通りする。
// ここでも毎回、管理者かどうかを確かめる。

import { NextResponse } from "next/server";
import { currentAdmin, currentUser } from "@/lib/auth";
import { getAccounts } from "@/lib/accounts";
import { hashPassword, nameProblem, passwordProblem, type Role } from "@/lib/users";

export const dynamic = "force-dynamic";

type Action =
  | { type: "create"; name: string; password: string; role: Role }
  | { type: "setRole"; id: string; role: Role }
  | { type: "setActive"; id: string; active: boolean }
  | { type: "setPassword"; id: string; password: string };

export async function GET() {
  const admin = await currentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "管理者だけが使えます。" }, { status: 403 });
  }
  const store = getAccounts();
  const [users, audit] = await Promise.all([store.listUsers(), store.recentAudit(60)]);
  return NextResponse.json({ users, audit, me: admin });
}

async function isLastAdmin(id: string): Promise<boolean> {
  const users = await getAccounts().listUsers();
  const admins = users.filter((u) => u.role === "admin" && u.active);
  return admins.length <= 1 && admins.some((u) => u.id === id);
}

export async function POST(request: Request) {
  const admin = await currentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "管理者だけが使えます。" }, { status: 403 });
  }

  let action: Action;
  try {
    action = (await request.json()) as Action;
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }

  const store = getAccounts();

  try {
    switch (action.type) {
      case "create": {
        const name = (action.name ?? "").trim();
        const nameNg = nameProblem(name);
        if (nameNg) return NextResponse.json({ error: nameNg }, { status: 400 });
        const passNg = passwordProblem(action.password ?? "");
        if (passNg) return NextResponse.json({ error: passNg }, { status: 400 });
        if (await store.findUser(name)) {
          return NextResponse.json(
            { error: "同じお名前のアカウントがすでにあります。" },
            { status: 409 }
          );
        }
        await store.createUser(
          {
            id: crypto.randomUUID(),
            name,
            role: action.role === "admin" ? "admin" : "member",
            active: true,
            createdAt: new Date().toISOString(),
            createdBy: admin.name,
          },
          await hashPassword(action.password),
          admin.name
        );
        break;
      }
      case "setRole": {
        if (action.role !== "admin" && (await isLastAdmin(action.id))) {
          return NextResponse.json(
            { error: "管理者が 0 人になります。先に別の管理者を作ってください。" },
            { status: 400 }
          );
        }
        await store.setUserRole(action.id, action.role, admin.name);
        break;
      }
      case "setActive": {
        if (!action.active && (await isLastAdmin(action.id))) {
          return NextResponse.json(
            { error: "管理者が 0 人になります。先に別の管理者を作ってください。" },
            { status: 400 }
          );
        }
        await store.setUserActive(action.id, action.active, admin.name);
        break;
      }
      case "setPassword": {
        const passNg = passwordProblem(action.password ?? "");
        if (passNg) return NextResponse.json({ error: passNg }, { status: 400 });
        await store.setUserPassword(
          action.id,
          await hashPassword(action.password),
          admin.name
        );
        break;
      }
      default:
        return NextResponse.json({ error: "不明な操作です。" }, { status: 400 });
    }

    const [users, audit] = await Promise.all([store.listUsers(), store.recentAudit(60)]);
    return NextResponse.json({ users, audit, me: admin });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: message
          .replace(/[a-z+]+:\/\/[^\s"']+/gi, "(接続先は伏せています)")
          .slice(0, 300),
      },
      { status: 500 }
    );
  }
}

/** 自分のパスワードを変える。管理者でなくても自分のぶんは変えられる */
export async function PATCH(request: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }
  const passNg = passwordProblem(body.password ?? "");
  if (passNg) return NextResponse.json({ error: passNg }, { status: 400 });
  await getAccounts().setUserPassword(me.id, await hashPassword(body.password!), me.name);
  return NextResponse.json({ ok: true });
}
