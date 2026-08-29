// どの画面でも最初に要る共通のもの(自分・会社・ステージ・商材・担当者一覧)。
// 画面ごとに別々に取りに行くと、同じ問い合わせが何度も走る。

import { withSession } from "@/lib/api";
import { listProducts, listStages } from "@/lib/crm";
import { listUsers } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return withSession(async ({ user, org }) => {
    const [stages, products, users] = await Promise.all([
      listStages(org.id),
      listProducts(org.id),
      listUsers(org.id),
    ]);
    return {
      me: user,
      org,
      stages,
      products,
      users: users
        .filter((u) => u.active)
        .map((u) => ({ id: u.id, name: u.name, role: u.role })),
    };
  });
}
