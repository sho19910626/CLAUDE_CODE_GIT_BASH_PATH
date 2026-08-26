// 商談。一覧・1 件の詳細・作成・変更・ステージ移動・明細の保存・解約。

import { fail, readJson, toNumber, toText, withSession } from "@/lib/api";
import { currentAdminSession } from "@/lib/auth";
import {
  createDeal,
  deleteDeal,
  endRecurringItem,
  generateDealRevenues,
  getDeal,
  listActivities,
  listDeals,
  listRevenues,
  listStages,
  listTasks,
  saveDealItems,
  setDealStage,
  updateDeal,
  type DealInput,
} from "@/lib/crm";
import { monthKeyOf } from "@/lib/money";
import type { DealItem, RevenueType } from "@/lib/types";

export const dynamic = "force-dynamic";

function readDeal(raw: Record<string, unknown>): DealInput {
  return {
    companyId: toText(raw.companyId, 60),
    name: toText(raw.name, 160),
    stageId: toText(raw.stageId, 60),
    ownerUserId: toText(raw.ownerUserId, 60) || null,
    source: toText(raw.source, 60),
    expectedCloseOn: toText(raw.expectedCloseOn, 10) || null,
    note: toText(raw.note, 4000),
    lostReason: toText(raw.lostReason, 500),
  };
}

function readItems(raw: unknown): DealItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50).map((r: Record<string, unknown>, i) => ({
    id: toText(r.id, 60),
    dealId: "",
    productId: toText(r.productId, 60) || null,
    name: toText(r.name, 160) || "(名前なし)",
    revenueType: (toText(r.revenueType, 20) || "onetime") as RevenueType,
    unitLabel: toText(r.unitLabel, 8) || "件",
    unitPrice: toNumber(r.unitPrice),
    quantity: toNumber(r.quantity, 1),
    months: r.months === null || r.months === "" ? null : Math.max(0, toNumber(r.months)) || null,
    startOn: toText(r.startOn, 10) || null,
    endOn: toText(r.endOn, 10) || null,
    passthroughAmount: toNumber(r.passthroughAmount),
    note: toText(r.note, 1000),
    sortOrder: i,
  }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  return withSession(async ({ org }) => {
    if (id) {
      const deal = await getDeal(org.id, id);
      if (!deal) throw new Error("商談が見つかりません。");
      const [activities, tasks, revenues] = await Promise.all([
        listActivities(org.id, { dealId: id, limit: 100 }),
        listTasks(org.id, { dealId: id, includeDone: true }),
        listRevenues(org.id, { dealId: id, limit: 300 }),
      ]);
      return { deal, activities, tasks, revenues };
    }
    const deals = await listDeals(org.id, {
      q: url.searchParams.get("q") ?? undefined,
      stageId: url.searchParams.get("stageId") ?? undefined,
      companyId: url.searchParams.get("companyId") ?? undefined,
      ownerUserId: url.searchParams.get("ownerUserId") ?? undefined,
      openOnly: url.searchParams.get("openOnly") === "1",
    });
    return { deals, stages: await listStages(org.id) };
  });
}

type Action =
  | { type: "create"; deal: Record<string, unknown>; items?: unknown }
  | { type: "update"; id: string; deal: Record<string, unknown> }
  | { type: "delete"; id: string }
  | { type: "setStage"; id: string; stageId: string }
  | { type: "saveItems"; id: string; items: unknown }
  | { type: "endItem"; itemId: string; dealId: string; endMonth: string };

export async function POST(request: Request) {
  const action = await readJson<Action>(request);
  if (!action) return fail("入力が不正です。");

  // 商談を消すと売上予定まで消える。消せるのは管理者だけ。
  if (action.type === "delete") {
    const admin = await currentAdminSession();
    if (!admin) return fail("商談を消せるのは管理者だけです。", 403);
    await deleteDeal(admin.org.id, action.id, admin.user.name);
    return Response.json({ ok: true });
  }

  return withSession(async ({ user, org }) => {
    switch (action.type) {
      case "create": {
        const input = readDeal(action.deal);
        if (!input.companyId) throw new Error("取引先を選んでください。");
        if (!input.name) throw new Error("商談の名前を入れてください。");
        if (!input.stageId) {
          const stages = await listStages(org.id);
          input.stageId = stages.find((s) => s.kind === "open")?.id ?? "";
        }
        // 担当が選ばれていなければ、作った人を担当にする
        if (!input.ownerUserId) input.ownerUserId = user.id;
        const deal = await createDeal(org.id, input, user.name);
        const items = readItems(action.items);
        if (items.length > 0) await saveDealItems(org.id, deal.id, items);
        return { deal: await getDeal(org.id, deal.id) };
      }
      case "update": {
        const input = readDeal(action.deal);
        if (!input.name) throw new Error("商談の名前を入れてください。");
        return { deal: await updateDeal(org.id, action.id, input, user.name) };
      }
      case "setStage": {
        const result = await setDealStage(org.id, action.id, action.stageId, user.name);
        if (!result.ok) throw new Error(result.error ?? "ステージを変えられませんでした。");
        return { deal: await getDeal(org.id, action.id), generated: result.generated };
      }
      case "saveItems": {
        const items = readItems(action.items);
        await saveDealItems(org.id, action.id, items);
        // 受注済みの商談で内容を変えたときは、今月から先の売上予定を作り直す。
        // 過去の月はすでに実績なので触らない。
        const deal = await getDeal(org.id, action.id);
        if (deal?.revenueGenerated) {
          await generateDealRevenues(org.id, action.id, {
            fromMonth: monthKeyOf(),
            actor: user.name,
          });
        }
        return {
          deal: await getDeal(org.id, action.id),
          revenues: await listRevenues(org.id, { dealId: action.id, limit: 300 }),
        };
      }
      case "endItem": {
        const month = toText(action.endMonth, 7) || monthKeyOf();
        await endRecurringItem(org.id, action.itemId, month, user.name);
        return {
          deal: await getDeal(org.id, action.dealId),
          revenues: await listRevenues(org.id, { dealId: action.dealId, limit: 300 }),
        };
      }
      default:
        throw new Error("不明な操作です。");
    }
  });
}
