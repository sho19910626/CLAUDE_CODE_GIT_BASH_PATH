// 設定。ステージ・商材・売上目標。
//
// ステージと商材を会社ごとに変えられるようにしてあるのは、
// 他社に入れたときに営業の流れも商材も違うため。

import { fail, readJson, toNumber, toText, withAdmin, withSession } from "@/lib/api";
import {
  deleteChannel,
  deleteMetric,
  deleteProduct,
  deleteStage,
  listChannels,
  listMetrics,
  listProducts,
  listStages,
  listTargets,
  saveChannel,
  saveMetric,
  saveProduct,
  saveStage,
  setTarget,
} from "@/lib/crm";
import { addMonths, monthKeyOf, toMonthKey } from "@/lib/money";
import { listUsers } from "@/lib/store";
import { seedReports } from "@/lib/seed";
import type { MetricFormat, MetricKind, RevenueType, StageKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return withSession(async ({ user, org }) => {
    const now = monthKeyOf();
    // 先に使い始めていた会社には媒体と指標がまだ無いので、ここでも一度だけ入れる
    await seedReports(org.id);
    const [stages, products, targets, users, channels, metrics] = await Promise.all([
      listStages(org.id),
      listProducts(org.id),
      listTargets(org.id, addMonths(now, -3), addMonths(now, 11)),
      listUsers(org.id),
      listChannels(org.id),
      listMetrics(org.id),
    ]);
    return { stages, products, targets, users, channels, metrics, me: user, org };
  });
}

type Action =
  | { type: "saveStage"; stage: Record<string, unknown> }
  | { type: "deleteStage"; id: string }
  | { type: "reorderStages"; ids: string[] }
  | { type: "saveProduct"; product: Record<string, unknown> }
  | { type: "deleteProduct"; id: string }
  | { type: "setTarget"; month: string; userId?: string; amount: number }
  | { type: "saveChannel"; channel: Record<string, unknown> }
  | { type: "deleteChannel"; id: string }
  | { type: "saveMetric"; metric: Record<string, unknown> }
  | { type: "deleteMetric"; id: string };

export async function POST(request: Request) {
  const action = await readJson<Action>(request);
  if (!action) return fail("入力が不正です。");

  // 設定を変えると全員の見え方と集計が変わる。管理者だけにする。
  return withAdmin(async ({ user, org }) => {
    switch (action.type) {
      case "saveStage": {
        const s = action.stage;
        const name = toText(s.name, 40);
        if (!name) throw new Error("ステージ名を入れてください。");
        await saveStage(
          org.id,
          {
            id: toText(s.id, 60) || undefined,
            name,
            probability: Math.max(0, Math.min(100, toNumber(s.probability))),
            kind: (toText(s.kind, 10) || "open") as StageKind,
            sortOrder: toNumber(s.sortOrder, 99),
            active: s.active !== false,
          },
          user.name
        );
        break;
      }
      case "deleteStage": {
        const result = await deleteStage(org.id, action.id, user.name);
        if (!result.ok) throw new Error(result.error ?? "消せませんでした。");
        break;
      }
      case "reorderStages": {
        const stages = await listStages(org.id);
        for (let i = 0; i < action.ids.length; i++) {
          const stage = stages.find((s) => s.id === action.ids[i]);
          if (stage) await saveStage(org.id, { ...stage, sortOrder: i }, user.name);
        }
        break;
      }
      case "saveProduct": {
        const p = action.product;
        const name = toText(p.name, 120);
        if (!name) throw new Error("商材名を入れてください。");
        await saveProduct(
          org.id,
          {
            id: toText(p.id, 60) || undefined,
            name,
            revenueType: (toText(p.revenueType, 20) || "onetime") as RevenueType,
            defaultUnitPrice: toNumber(p.defaultUnitPrice),
            unitLabel: toText(p.unitLabel, 20) || "件",
            defaultMonths:
              p.defaultMonths === null || p.defaultMonths === ""
                ? null
                : Math.max(0, toNumber(p.defaultMonths)) || null,
            note: toText(p.note, 1000),
            active: p.active !== false,
            sortOrder: toNumber(p.sortOrder, 99),
          },
          user.name
        );
        break;
      }
      case "deleteProduct": {
        const result = await deleteProduct(org.id, action.id, user.name);
        if (result.archived) {
          // 過去の商談・売上から参照されているので、消さずに使用停止にした
        }
        break;
      }
      case "setTarget": {
        await setTarget(
          org.id,
          toMonthKey(toText(action.month, 10) || monthKeyOf()),
          toText(action.userId, 60),
          toNumber(action.amount),
          user.name
        );
        break;
      }
      case "saveChannel": {
        const name = toText(action.channel.name, 60);
        if (!name) throw new Error("媒体名を入れてください。");
        await saveChannel(
          org.id,
          {
            id: toText(action.channel.id, 60) || undefined,
            name,
            sortOrder: toNumber(action.channel.sortOrder, 99),
            active: action.channel.active !== false,
          },
          user.name
        );
        break;
      }
      case "deleteChannel":
        await deleteChannel(org.id, action.id, user.name);
        break;
      case "saveMetric": {
        const m = action.metric;
        const name = toText(m.name, 60);
        if (!name) throw new Error("項目名を入れてください。");
        await saveMetric(
          org.id,
          {
            id: toText(m.id, 60) || undefined,
            name,
            unit: toText(m.unit, 10),
            kind: (toText(m.kind, 10) || "input") as MetricKind,
            format: (toText(m.format, 10) || "number") as MetricFormat,
            numeratorId: toText(m.numeratorId, 60) || null,
            denominatorId: toText(m.denominatorId, 60) || null,
            sortOrder: toNumber(m.sortOrder, 99),
            active: m.active !== false,
          },
          user.name
        );
        break;
      }
      case "deleteMetric": {
        const result = await deleteMetric(org.id, action.id, user.name);
        if (result.error) throw new Error(result.error);
        break;
      }
      default:
        throw new Error("不明な操作です。");
    }

    const now = monthKeyOf();
    const [stages, products, targets, channels, metrics] = await Promise.all([
      listStages(org.id),
      listProducts(org.id),
      listTargets(org.id, addMonths(now, -3), addMonths(now, 11)),
      listChannels(org.id),
      listMetrics(org.id),
    ]);
    return { stages, products, targets, channels, metrics };
  });
}
