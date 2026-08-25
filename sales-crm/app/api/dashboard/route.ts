// ダッシュボードの数字。集計は lib/dashboard.ts にまとめてある。

import { withSession } from "@/lib/api";
import { extendOpenEndedRevenues, listTasks } from "@/lib/crm";
import { buildDashboard } from "@/lib/dashboard";
import { monthKeyOf } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const month = url.searchParams.get("month") || monthKeyOf();

  return withSession(async ({ org, user }) => {
    await extendOpenEndedRevenues(org.id);
    const [data, tasks] = await Promise.all([
      buildDashboard(org.id, month),
      listTasks(org.id, { limit: 50 }),
    ]);
    return { data, tasks, me: user, org };
  });
}
