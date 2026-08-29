// 次回アクション(ToDo)。期限を持たせて、ダッシュボードで催促する。

import { fail, readJson, toText, withSession } from "@/lib/api";
import { createTask, deleteTask, listTasks, updateTask } from "@/lib/crm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return withSession(async ({ org }) => ({
    tasks: await listTasks(org.id, {
      companyId: url.searchParams.get("companyId") ?? undefined,
      dealId: url.searchParams.get("dealId") ?? undefined,
      assigneeUserId: url.searchParams.get("assigneeUserId") ?? undefined,
      includeDone: url.searchParams.get("includeDone") === "1",
    }),
  }));
}

type Action =
  | {
      type: "create";
      title: string;
      companyId?: string;
      dealId?: string;
      dueOn?: string;
      assigneeUserId?: string;
    }
  | { type: "update"; id: string; title?: string; dueOn?: string; done?: boolean; assigneeUserId?: string }
  | { type: "delete"; id: string };

export async function POST(request: Request) {
  const action = await readJson<Action>(request);
  if (!action) return fail("入力が不正です。");

  return withSession(async ({ user, org }) => {
    switch (action.type) {
      case "create": {
        const title = toText(action.title, 200);
        if (!title) throw new Error("やることを入れてください。");
        await createTask(
          org.id,
          {
            title,
            companyId: toText(action.companyId, 60) || null,
            dealId: toText(action.dealId, 60) || null,
            dueOn: toText(action.dueOn, 10) || null,
            assigneeUserId: toText(action.assigneeUserId, 60) || user.id,
          },
          user.name
        );
        break;
      }
      case "update":
        await updateTask(org.id, action.id, {
          title: action.title === undefined ? undefined : toText(action.title, 200),
          dueOn: action.dueOn === undefined ? undefined : toText(action.dueOn, 10) || null,
          done: action.done,
          assigneeUserId:
            action.assigneeUserId === undefined
              ? undefined
              : toText(action.assigneeUserId, 60) || null,
        });
        break;
      case "delete":
        await deleteTask(org.id, action.id);
        break;
      default:
        throw new Error("不明な操作です。");
    }
    return { tasks: await listTasks(org.id, { includeDone: true }) };
  });
}
