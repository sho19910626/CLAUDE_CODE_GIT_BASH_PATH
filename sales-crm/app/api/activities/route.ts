// 活動履歴。誰がいつ何をしたかを取引先・商談にぶら下げる。

import { fail, readJson, toText, withSession } from "@/lib/api";
import { createActivity, deleteActivity, listActivities } from "@/lib/crm";
import type { ActivityKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return withSession(async ({ org }) => ({
    activities: await listActivities(org.id, {
      companyId: url.searchParams.get("companyId") ?? undefined,
      dealId: url.searchParams.get("dealId") ?? undefined,
      limit: Number(url.searchParams.get("limit")) || undefined,
    }),
  }));
}

type Action =
  | {
      type: "create";
      companyId: string;
      dealId?: string;
      kind: ActivityKind;
      happenedAt?: string;
      subject: string;
      body?: string;
    }
  | { type: "delete"; id: string };

export async function POST(request: Request) {
  const action = await readJson<Action>(request);
  if (!action) return fail("入力が不正です。");

  return withSession(async ({ user, org }) => {
    if (action.type === "delete") {
      await deleteActivity(org.id, action.id);
      return { ok: true };
    }
    const companyId = toText(action.companyId, 60);
    const subject = toText(action.subject, 200);
    if (!companyId) throw new Error("取引先が指定されていません。");
    if (!subject) throw new Error("内容を一行で入れてください。");
    await createActivity(
      org.id,
      {
        companyId,
        dealId: toText(action.dealId, 60) || null,
        kind: action.kind,
        happenedAt: toText(action.happenedAt, 40) || undefined,
        subject,
        body: toText(action.body, 4000),
      },
      { id: user.id, name: user.name }
    );
    return {
      activities: await listActivities(org.id, {
        companyId,
        dealId: toText(action.dealId, 60) || undefined,
        limit: 100,
      }),
    };
  });
}
