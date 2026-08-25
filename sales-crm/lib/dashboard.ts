// ダッシュボードの数字づくり。
//
// 毎日見る 4 つを 1 回の問い合わせでまとめて返す:
//   1. 今月の売上と目標達成率
//   2. MRR(毎月積み上がっている売上)と、その月の新規・解約
//   3. パイプライン(ステージ別の商談と、確度をかけた着地見込み)
//   4. 活動量と転換率
//
// 集計を画面側でやらないのは、同じ数字が場所ごとに違って見えるのを防ぐため。

import { num, rows, ymd } from "./db";
import { listStages } from "./crm";
import {
  addMonths,
  dealValue,
  isItemActiveInMonth,
  monthKeyOf,
  monthStart,
  monthRange,
  percent,
  toMonthKey,
} from "./money";
import type { ActivityKind, DealItem, RevenueType, Stage } from "./types";

export interface DashboardData {
  month: string;
  sales: {
    target: number;
    confirmed: number;
    planned: number;
    total: number;
    achievement: number;
    byType: { type: RevenueType; amount: number }[];
    passthrough: number;
  };
  mrr: {
    current: number;
    previous: number;
    added: number;
    churned: number;
    contracts: number;
    churnedContracts: number;
  };
  pipeline: {
    stages: { id: string; name: string; probability: number; count: number; value: number }[];
    openCount: number;
    totalValue: number;
    weighted: number;
    /** 今月中に決まる見込みの商談だけを足したもの */
    closingThisMonth: number;
  };
  activity: {
    byKind: { kind: ActivityKind; count: number }[];
    total30: number;
    won90: number;
    lost90: number;
    winRate: number;
    avgDealSize: number;
    avgDaysToClose: number;
  };
  trend: { month: string; confirmed: number; planned: number; mrr: number; target: number }[];
  tasks: { overdue: number; today: number; week: number };
  stale: { id: string; name: string; companyName: string; stageName: string; days: number }[];
}

interface RecurringRow {
  id: string;
  deal_id: string;
  product_id: string | null;
  name: string;
  revenue_type: string;
  unit_price: string;
  quantity: string;
  months: number | null;
  start_on: string | null;
  end_on: string | null;
  passthrough_amount: string;
  closed_on: string | null;
}

export async function buildDashboard(
  orgId: string,
  monthKey = monthKeyOf()
): Promise<DashboardData> {
  const stages = await listStages(orgId);
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const prevMonth = addMonths(monthKey, -1);
  const trendFrom = addMonths(monthKey, -11);

  /* ---- 1. 今月の売上と目標 ---- */

  const monthRows = await rows<{
    revenue_type: string;
    status: string;
    amount: string;
    passthrough_amount: string;
  }>(
    `select revenue_type, status, sum(amount) as amount,
            sum(passthrough_amount) as passthrough_amount
     from crm_revenues where org_id = $1 and month = $2
     group by revenue_type, status`,
    [orgId, monthStart(monthKey)]
  );

  let confirmed = 0;
  let planned = 0;
  let passthrough = 0;
  const byTypeMap = new Map<RevenueType, number>();
  for (const r of monthRows) {
    const amount = num(r.amount);
    if (r.status === "confirmed") confirmed += amount;
    else planned += amount;
    passthrough += num(r.passthrough_amount);
    const t = r.revenue_type as RevenueType;
    byTypeMap.set(t, (byTypeMap.get(t) ?? 0) + amount);
  }

  const targetRows = await rows<{ user_id: string; amount: string }>(
    `select user_id, amount from crm_targets where org_id = $1 and month = $2`,
    [orgId, monthStart(monthKey)]
  );
  // 全社の目標が入っていればそれを使う。無ければ個人の目標を足す
  const orgTarget = targetRows.find((t) => t.user_id === "");
  const target = orgTarget
    ? num(orgTarget.amount)
    : targetRows.reduce((s, t) => s + num(t.amount), 0);

  /* ---- 2. MRR ---- */

  const recurringRows = await rows<RecurringRow>(
    `select i.id, i.deal_id, i.product_id, i.name, i.revenue_type, i.unit_price,
            i.quantity, i.months, i.start_on, i.end_on, i.passthrough_amount,
            d.closed_on
     from crm_deal_items i
     join crm_deals d on d.id = i.deal_id and d.org_id = i.org_id
     join crm_stages s on s.id = d.stage_id and s.org_id = d.org_id
     where i.org_id = $1 and s.kind = 'won' and i.revenue_type = 'recurring'`,
    [orgId]
  );

  const recurring = recurringRows.map((r) => ({
    item: {
      id: r.id,
      dealId: r.deal_id,
      productId: r.product_id,
      name: r.name,
      revenueType: "recurring" as RevenueType,
      unitPrice: num(r.unit_price),
      quantity: num(r.quantity),
      months: r.months,
      startOn: ymd(r.start_on),
      endOn: ymd(r.end_on),
      passthroughAmount: num(r.passthrough_amount),
      note: "",
      sortOrder: 0,
    } satisfies DealItem,
    closedOn: ymd(r.closed_on),
  }));

  const mrrIn = (key: string) => {
    let sum = 0;
    let count = 0;
    for (const { item, closedOn } of recurring) {
      if (isItemActiveInMonth(item, key, closedOn)) {
        sum += item.unitPrice * item.quantity;
        count++;
      }
    }
    return { sum, count };
  };

  const nowMrr = mrrIn(monthKey);
  const prevMrr = mrrIn(prevMonth);
  let added = 0;
  let churned = 0;
  let churnedContracts = 0;
  for (const { item, closedOn } of recurring) {
    const nowOn = isItemActiveInMonth(item, monthKey, closedOn);
    const prevOn = isItemActiveInMonth(item, prevMonth, closedOn);
    const amount = item.unitPrice * item.quantity;
    if (nowOn && !prevOn) added += amount;
    if (!nowOn && prevOn) {
      churned += amount;
      churnedContracts++;
    }
  }

  /* ---- 3. パイプライン ---- */

  const openDeals = await rows<{
    id: string;
    name: string;
    company_name: string;
    stage_id: string;
    expected_close_on: string | null;
    updated_at: string;
  }>(
    `select d.id, d.name, c.name as company_name, d.stage_id, d.expected_close_on,
            d.updated_at
     from crm_deals d
     join crm_companies c on c.id = d.company_id and c.org_id = d.org_id
     join crm_stages s on s.id = d.stage_id and s.org_id = d.org_id
     where d.org_id = $1 and s.kind = 'open'`,
    [orgId]
  );

  const openItems = await rows<{
    deal_id: string;
    revenue_type: string;
    unit_price: string;
    quantity: string;
    months: number | null;
    passthrough_amount: string;
  }>(
    `select i.deal_id, i.revenue_type, i.unit_price, i.quantity, i.months,
            i.passthrough_amount
     from crm_deal_items i
     join crm_deals d on d.id = i.deal_id and d.org_id = i.org_id
     join crm_stages s on s.id = d.stage_id and s.org_id = d.org_id
     where i.org_id = $1 and s.kind = 'open'`,
    [orgId]
  );

  const itemsByDeal = new Map<string, DealItem[]>();
  for (const r of openItems) {
    const item: DealItem = {
      id: "",
      dealId: r.deal_id,
      productId: null,
      name: "",
      revenueType: r.revenue_type as RevenueType,
      unitPrice: num(r.unit_price),
      quantity: num(r.quantity),
      months: r.months,
      startOn: null,
      endOn: null,
      passthroughAmount: num(r.passthrough_amount),
      note: "",
      sortOrder: 0,
    };
    const list = itemsByDeal.get(r.deal_id);
    if (list) list.push(item);
    else itemsByDeal.set(r.deal_id, [item]);
  }

  const stageAgg = new Map<string, { count: number; value: number }>();
  let totalValue = 0;
  let weighted = 0;
  let closingThisMonth = 0;
  for (const d of openDeals) {
    const value = dealValue(itemsByDeal.get(d.id) ?? []);
    const stage: Stage | undefined = stageById.get(d.stage_id);
    const agg = stageAgg.get(d.stage_id) ?? { count: 0, value: 0 };
    agg.count++;
    agg.value += value;
    stageAgg.set(d.stage_id, agg);
    totalValue += value;
    weighted += value * ((stage?.probability ?? 0) / 100);
    if (d.expected_close_on && toMonthKey(ymd(d.expected_close_on)) === monthKey) {
      closingThisMonth += value * ((stage?.probability ?? 0) / 100);
    }
  }

  /* ---- 4. 活動量と転換率 ---- */

  const actRows = await rows<{ kind: string; n: number }>(
    `select kind, count(*)::int as n from crm_activities
     where org_id = $1 and happened_at > now() - interval '30 days'
     group by kind`,
    [orgId]
  );

  const closed = await rows<{ kind: string; n: number; value: string; days: string }>(
    `select s.kind, count(*)::int as n,
            coalesce(sum(v.value), 0) as value,
            coalesce(avg(extract(epoch from (d.closed_on::timestamptz - d.created_at)) / 86400), 0) as days
     from crm_deals d
     join crm_stages s on s.id = d.stage_id and s.org_id = d.org_id
     left join lateral (
       select sum(
         case when i.revenue_type = 'onetime' then i.unit_price * i.quantity
              else i.unit_price * i.quantity * coalesce(nullif(i.months, 0), 12) end
       ) as value
       from crm_deal_items i where i.deal_id = d.id and i.org_id = d.org_id
     ) v on true
     where d.org_id = $1 and s.kind in ('won', 'lost')
       and d.closed_on > current_date - interval '90 days'
     group by s.kind`,
    [orgId]
  );
  const won = closed.find((c) => c.kind === "won");
  const lost = closed.find((c) => c.kind === "lost");
  const won90 = num(won?.n);
  const lost90 = num(lost?.n);

  /* ---- 5. 12 か月の推移 ---- */

  const trendRows = await rows<{ month: string; status: string; amount: string }>(
    `select month, status, sum(amount) as amount from crm_revenues
     where org_id = $1 and month >= $2 and month <= $3
     group by month, status`,
    [orgId, monthStart(trendFrom), monthStart(addMonths(monthKey, 0))]
  );
  const trendTargets = await rows<{ month: string; amount: string }>(
    `select month, sum(amount) as amount from crm_targets
     where org_id = $1 and month >= $2 and month <= $3 and user_id = ''
     group by month`,
    [orgId, monthStart(trendFrom), monthStart(monthKey)]
  );

  const trend = monthRange(trendFrom, 12).map((key) => {
    const c = trendRows.find((r) => toMonthKey(ymd(r.month)) === key && r.status === "confirmed");
    const p = trendRows.find((r) => toMonthKey(ymd(r.month)) === key && r.status === "planned");
    const t = trendTargets.find((r) => toMonthKey(ymd(r.month)) === key);
    return {
      month: key,
      confirmed: num(c?.amount),
      planned: num(p?.amount),
      mrr: mrrIn(key).sum,
      target: num(t?.amount),
    };
  });

  /* ---- 6. ToDo と停滞 ---- */

  const taskCounts = await rows<{ overdue: number; today: number; week: number }>(
    `select
       count(*) filter (where due_on < current_date)::int as overdue,
       count(*) filter (where due_on = current_date)::int as today,
       count(*) filter (where due_on > current_date and due_on <= current_date + 7)::int as week
     from crm_tasks where org_id = $1 and done_at is null`,
    [orgId]
  );

  const staleRows = await rows<{
    id: string;
    name: string;
    company_name: string;
    stage_name: string;
    days: string;
  }>(
    `select d.id, d.name, c.name as company_name, s.name as stage_name,
            extract(epoch from (now() - greatest(d.updated_at,
              coalesce((select max(a.happened_at) from crm_activities a
                        where a.deal_id = d.id and a.org_id = d.org_id), d.created_at)
            ))) / 86400 as days
     from crm_deals d
     join crm_companies c on c.id = d.company_id and c.org_id = d.org_id
     join crm_stages s on s.id = d.stage_id and s.org_id = d.org_id
     where d.org_id = $1 and s.kind = 'open'
       and d.updated_at < now() - interval '14 days'
     order by days desc limit 10`,
    [orgId]
  );

  return {
    month: monthKey,
    sales: {
      target,
      confirmed,
      planned,
      total: confirmed + planned,
      achievement: percent(confirmed, target),
      byType: (["onetime", "recurring", "performance", "passthrough"] as RevenueType[]).map(
        (type) => ({ type, amount: byTypeMap.get(type) ?? 0 })
      ),
      passthrough,
    },
    mrr: {
      current: nowMrr.sum,
      previous: prevMrr.sum,
      added,
      churned,
      contracts: nowMrr.count,
      churnedContracts,
    },
    pipeline: {
      stages: stages
        .filter((s) => s.kind === "open")
        .map((s) => ({
          id: s.id,
          name: s.name,
          probability: s.probability,
          count: stageAgg.get(s.id)?.count ?? 0,
          value: stageAgg.get(s.id)?.value ?? 0,
        })),
      openCount: openDeals.length,
      totalValue,
      weighted,
      closingThisMonth,
    },
    activity: {
      byKind: (["form", "call", "email", "meeting", "note"] as ActivityKind[]).map((kind) => ({
        kind,
        count: num(actRows.find((a) => a.kind === kind)?.n),
      })),
      total30: actRows.reduce((s, a) => s + num(a.n), 0),
      won90,
      lost90,
      winRate: percent(won90, won90 + lost90),
      avgDealSize: won90 > 0 ? num(won?.value) / won90 : 0,
      avgDaysToClose: Math.round(num(won?.days)),
    },
    trend,
    tasks: {
      overdue: num(taskCounts[0]?.overdue),
      today: num(taskCounts[0]?.today),
      week: num(taskCounts[0]?.week),
    },
    stale: staleRows.map((s) => ({
      id: s.id,
      name: s.name,
      companyName: s.company_name,
      stageName: s.stage_name,
      days: Math.floor(num(s.days)),
    })),
  };
}
