// ダッシュボードの数字。集計は lib/dashboard.ts にまとめてある。

import { withSession } from "@/lib/api";
import { listTasks } from "@/lib/crm";
import { buildDashboard } from "@/lib/dashboard";
import { monthKeyOf } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const month = url.searchParams.get("month") || monthKeyOf();

  return withSession(async ({ org, user }) => {
    // 売上予定の補充はここではやらない。
    // ダッシュボードが見るのは今月までの実績と MRR なので、先の月を
    // 用意しなくても数字は変わらない。毎回書き込みが走るぶんだけ遅くなる。
    // 補充は売上画面を開いたときに走る。
    const [data, tasks] = await Promise.all([
      buildDashboard(org.id, month),
      listTasks(org.id, { limit: 50 }),
    ]);
    return { data, tasks, me: user, org };
  });
}
