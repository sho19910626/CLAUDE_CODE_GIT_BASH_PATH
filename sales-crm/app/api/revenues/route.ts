// 売上。月ごとの一覧と、実績の書き換え・確定。

import { fail, readJson, toNumber, toText, withSession } from "@/lib/api";
import { currentAdminSession } from "@/lib/auth";
import {
  confirmMonth,
  deleteRevenue,
  extendOpenEndedRevenues,
  listRevenues,
  listTargets,
  saveRevenue,
} from "@/lib/crm";
import { addMonths, monthKeyOf, toMonthKey } from "@/lib/money";
import type { RevenueStatus, RevenueType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const now = monthKeyOf();
  const from = url.searchParams.get("fromMonth") || addMonths(now, -5);
  const to = url.searchParams.get("toMonth") || addMonths(now, 6);

  return withSession(async ({ org }) => {
    // 「解約まで継続」の契約は、放っておくと売上予定が尽きる。
    // 画面を開いたときに 12 か月先まで補充しておく。
    await extendOpenEndedRevenues(org.id);
    const [revenues, targets] = await Promise.all([
      listRevenues(org.id, {
        fromMonth: from,
        toMonth: to,
        companyId: url.searchParams.get("companyId") ?? undefined,
        dealId: url.searchParams.get("dealId") ?? undefined,
        limit: 2000,
      }),
      listTargets(org.id, from, to),
    ]);
    return { revenues, targets, fromMonth: from, toMonth: to };
  });
}

type Action =
  | { type: "save"; revenue: Record<string, unknown> }
  | { type: "delete"; id: string }
  | { type: "confirmMonth"; month: string };

export async function POST(request: Request) {
  const action = await readJson<Action>(request);
  if (!action) return fail("入力が不正です。");

  // 売上の行を消すのは、記録を消す操作。管理者だけにする。
  if (action.type === "delete") {
    const admin = await currentAdminSession();
    if (!admin) return fail("売上の行を消せるのは管理者だけです。", 403);
    await deleteRevenue(admin.org.id, action.id, admin.user.name);
    return Response.json({ ok: true });
  }

  return withSession(async ({ user, org }) => {
    if (action.type === "confirmMonth") {
      const month = toMonthKey(toText(action.month, 7) || monthKeyOf());
      const n = await confirmMonth(org.id, month, user.name);
      return { confirmed: n };
    }
    const r = action.revenue;
    const companyId = toText(r.companyId, 60);
    const name = toText(r.name, 160);
    if (!companyId) throw new Error("取引先を選んでください。");
    if (!name) throw new Error("内容を入れてください。");
    await saveRevenue(
      org.id,
      {
        id: toText(r.id, 60) || undefined,
        month: toText(r.month, 10) || monthKeyOf(),
        companyId,
        dealId: toText(r.dealId, 60) || null,
        productId: toText(r.productId, 60) || null,
        revenueType: (toText(r.revenueType, 20) || "onetime") as RevenueType,
        name,
        amount: toNumber(r.amount),
        passthroughAmount: toNumber(r.passthroughAmount),
        units: toNumber(r.units),
        status: (toText(r.status, 20) || "planned") as RevenueStatus,
        note: toText(r.note, 1000),
      },
      user.name
    );
    return { ok: true };
  });
}
