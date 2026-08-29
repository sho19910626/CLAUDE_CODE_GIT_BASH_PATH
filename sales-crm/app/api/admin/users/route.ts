// アカウントの発行・停止・権限変更。管理者だけが使える。
//
// 画面側でボタンを隠すだけでは、API を直接叩かれると素通りする。
// ここでも毎回、管理者かどうかを確かめる。
// 触れるのは自分の会社のアカウントだけ(org_id を where に必ず入れている)。

import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { fail, failFrom, readJson, withAdmin } from "@/lib/api";
import { newId } from "@/lib/db";
import {
  createUser,
  findUserInOrg,
  listUsers,
  recentAudit,
  setUserActive,
  setUserPassword,
  setUserRole,
} from "@/lib/store";
import { hashPassword, nameProblem, passwordProblem, type Role } from "@/lib/users";

export const dynamic = "force-dynamic";

type Action =
  | { type: "create"; name: string; password: string; role: Role }
  | { type: "setRole"; id: string; role: Role }
  | { type: "setActive"; id: string; active: boolean }
  | { type: "setPassword"; id: string; password: string };

export async function GET() {
  return withAdmin(async ({ user, org }) => {
    const [users, audit] = await Promise.all([
      listUsers(org.id),
      recentAudit(org.id, 80),
    ]);
    return { users, audit, me: user, org };
  });
}

/** 自分の会社の、有効な管理者が自分ひとりかどうか */
async function isLastAdmin(orgId: string, id: string): Promise<boolean> {
  const users = await listUsers(orgId);
  const admins = users.filter((u) => u.role === "admin" && u.active);
  return admins.length <= 1 && admins.some((u) => u.id === id);
}

export async function POST(request: Request) {
  return withAdmin(async ({ user: admin, org }) => {
    const action = await readJson<Action>(request);
    if (!action) throw new Error("入力が不正です。");

    switch (action.type) {
      case "create": {
        const name = (action.name ?? "").trim();
        const nameNg = nameProblem(name);
        if (nameNg) throw new Error(nameNg);
        const passNg = passwordProblem(action.password ?? "");
        if (passNg) throw new Error(passNg);
        if (await findUserInOrg(org.id, name)) {
          throw new Error("同じお名前のアカウントがすでにあります。");
        }
        await createUser(
          {
            id: newId(),
            orgId: org.id,
            name,
            role: action.role === "admin" ? "admin" : "member",
            active: true,
            createdBy: admin.name,
          },
          await hashPassword(action.password),
          admin.name
        );
        break;
      }
      case "setRole": {
        if (action.role !== "admin" && (await isLastAdmin(org.id, action.id))) {
          throw new Error("管理者が 0 人になります。先に別の管理者を作ってください。");
        }
        await setUserRole(org.id, action.id, action.role, admin.name);
        break;
      }
      case "setActive": {
        if (!action.active && (await isLastAdmin(org.id, action.id))) {
          throw new Error("管理者が 0 人になります。先に別の管理者を作ってください。");
        }
        await setUserActive(org.id, action.id, action.active, admin.name);
        break;
      }
      case "setPassword": {
        const passNg = passwordProblem(action.password ?? "");
        if (passNg) throw new Error(passNg);
        await setUserPassword(
          org.id,
          action.id,
          await hashPassword(action.password),
          admin.name
        );
        break;
      }
      default:
        throw new Error("不明な操作です。");
    }

    const [users, audit] = await Promise.all([
      listUsers(org.id),
      recentAudit(org.id, 80),
    ]);
    return { users, audit, me: admin, org };
  });
}

/** 自分のパスワードを変える。管理者でなくても自分のぶんは変えられる */
export async function PATCH(request: Request) {
  try {
    const s = await currentSession();
    if (!s) return fail("ログインが必要です。", 401);
    const body = await readJson<{ password?: string }>(request);
    const passNg = passwordProblem(body?.password ?? "");
    if (passNg) return fail(passNg);
    await setUserPassword(
      s.org.id,
      s.user.id,
      await hashPassword(body!.password!),
      s.user.name
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failFrom(e);
  }
}
