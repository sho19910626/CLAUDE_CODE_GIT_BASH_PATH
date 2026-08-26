// 金額の計算。4 つの売上形態(単発 / 月額継続 / 成果報酬 / 広告費の立替)を
// ひとつの式にまとめず、形態ごとに意味の違う計算をしているのがこのファイルの要点。
//
//   単発      … 受注した月に一度だけ立つ
//   月額継続  … 契約が生きている月にずっと立つ(積み上がる = MRR)
//   成果報酬  … 毎月立つが金額は実績しだい。受注時点では見込みを置く
//   立替      … 売上は手数料だけ。預かった広告費は売上に混ぜない
//
// 「預かり金を売上に混ぜない」は特に大事で、混ぜると売上が実態の数倍に膨らむ。

import type { DealItem, RevenueType, Stage } from "./types";

/** 契約月数が決まっていない(解約まで継続)ものを、何か月ぶん見込むか */
export const DEFAULT_HORIZON_MONTHS = 12;

/* ---------- 月の扱い ---------- */
// 月は "YYYY-MM" の文字列で持ち回す。Date にすると時差で 1 日ずれ、
// 月初がひと月前になることがあるため。

export function monthKeyOf(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-08-01" や "2026-08-01T00:00:00Z" から "2026-08" を取り出す */
export function toMonthKey(v: string | null | undefined): string {
  return v ? v.slice(0, 7) : monthKeyOf();
}

/** データベースの date 列に入れる形 */
export function monthStart(key: string): string {
  return `${key}-01`;
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${y}年${Number(m)}月`;
}

export function shortMonthLabel(key: string): string {
  return `${Number(key.split("-")[1])}月`;
}

/** from から count か月ぶんの月キーを並べる */
export function monthRange(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(from, i));
}

export function todayYmd(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------- 表示 ---------- */

export function yen(n: number): string {
  const v = Math.round(n);
  return `${v < 0 ? "−" : ""}¥${Math.abs(v).toLocaleString("ja-JP")}`;
}

/** 桁が多い数字を「1,234万円」の形に。ダッシュボードの見出し用 */
export function man(n: number): string {
  const v = Math.round(n / 10000);
  if (Math.abs(n) < 10000) return yen(n);
  return `${v.toLocaleString("ja-JP")}万円`;
}

export function percent(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

/* ---------- 明細ひとつあたりの金額 ---------- */

/** その明細が「1 か月ぶん」に生む自社の売上 */
export function itemMonthlyRevenue(item: DealItem): number {
  if (item.revenueType === "onetime") return 0;
  return item.unitPrice * item.quantity;
}

/** その明細が受注月に一度だけ生む自社の売上 */
export function itemOnetimeRevenue(item: DealItem): number {
  return item.revenueType === "onetime" ? item.unitPrice * item.quantity : 0;
}

/** 見込む月数。決まっていなければ既定の見込み期間を使う */
export function itemMonths(item: DealItem): number {
  if (item.revenueType === "onetime") return 0;
  return item.months && item.months > 0 ? item.months : DEFAULT_HORIZON_MONTHS;
}

/** その明細が契約期間ぜんぶで生む自社の売上 */
export function itemContractValue(item: DealItem): number {
  if (item.revenueType === "onetime") return itemOnetimeRevenue(item);
  return itemMonthlyRevenue(item) * itemMonths(item);
}

/** その明細が 1 か月ぶんに預かる広告費(売上ではない) */
export function itemMonthlyPassthrough(item: DealItem): number {
  return item.revenueType === "passthrough" ? item.passthroughAmount : 0;
}

/* ---------- 商談ひとつあたりの金額 ---------- */

export interface DealTotals {
  /** 受注月に一度だけ立つぶん */
  onetime: number;
  /** 毎月立つぶんの合計(月額継続 + 成果報酬の見込み + 立替の手数料) */
  monthly: number;
  /** そのうち月額継続だけ。MRR に効くのはここ */
  recurringMonthly: number;
  /** 毎月の預かり広告費(売上ではない) */
  monthlyPassthrough: number;
  /** 契約期間ぜんぶの自社売上。パイプラインの金額はこれを使う */
  contractValue: number;
}

export function dealTotals(items: DealItem[]): DealTotals {
  const t: DealTotals = {
    onetime: 0,
    monthly: 0,
    recurringMonthly: 0,
    monthlyPassthrough: 0,
    contractValue: 0,
  };
  for (const item of items) {
    t.onetime += itemOnetimeRevenue(item);
    t.monthly += itemMonthlyRevenue(item);
    if (item.revenueType === "recurring") t.recurringMonthly += itemMonthlyRevenue(item);
    t.monthlyPassthrough += itemMonthlyPassthrough(item);
    t.contractValue += itemContractValue(item);
  }
  return t;
}

/** 商談の金額(＝契約期間ぜんぶの自社売上) */
export function dealValue(items: DealItem[]): number {
  return dealTotals(items).contractValue;
}

/** 確度をかけた着地見込み */
export function weightedValue(items: DealItem[], stage: Stage | undefined): number {
  return dealValue(items) * ((stage?.probability ?? 0) / 100);
}

/* ---------- 月額系の契約が、その月に生きているか ---------- */

/**
 * 解約済みかどうかも含めて、その月に課金される明細かを判定する。
 * MRR と解約の集計はここを唯一の基準にする(場所ごとに条件が違うと数字がずれる)。
 */
export function isItemActiveInMonth(
  item: DealItem,
  monthKey: string,
  fallbackStart: string | null
): boolean {
  if (item.revenueType === "onetime") return false;
  const start = toMonthKey(item.startOn ?? fallbackStart ?? undefined);
  if (monthDiff(start, monthKey) < 0) return false;
  // 解約月そのものは課金する。止まるのはその翌月から
  if (item.endOn && monthDiff(toMonthKey(item.endOn), monthKey) > 0) return false;
  if (!item.endOn && item.months && item.months > 0) {
    // 契約月数が決まっているものは、その月数を過ぎたら止まる
    if (monthDiff(start, monthKey) >= item.months) return false;
  }
  return true;
}

/* ---------- 受注したときに立てる売上の予定 ---------- */

export interface PlannedRevenue {
  monthKey: string;
  itemId: string;
  productId: string | null;
  revenueType: RevenueType;
  unitLabel: string;
  name: string;
  amount: number;
  passthroughAmount: number;
  units: number;
  status: "planned" | "confirmed";
}

/**
 * 受注(won)になった商談から、月ごとの売上予定を組み立てる。
 *
 *   単発      … 受注月に 1 件。すでに確定した売上なので confirmed
 *   月額継続  … 開始月から契約月数ぶん。まだ先の話なので planned
 *   成果報酬  … 同じ月数ぶん。金額は見込み。実績が出たら画面で書き換える
 *   立替      … 同じ月数ぶん。手数料が売上、預かり金は別の欄に入れる
 *
 * 「まだ確定していないもの(planned)」と「確定したもの(confirmed)」を分けて
 * 持つのは、今月の実績と着地見込みを別々に出せるようにするため。
 */
export function plannedRevenuesForDeal(
  items: DealItem[],
  wonMonthKey: string
): PlannedRevenue[] {
  const out: PlannedRevenue[] = [];
  for (const item of items) {
    if (item.revenueType === "onetime") {
      const amount = itemOnetimeRevenue(item);
      if (amount === 0) continue;
      out.push({
        monthKey: toMonthKey(item.startOn) || wonMonthKey,
        itemId: item.id,
        productId: item.productId,
        revenueType: item.revenueType,
        unitLabel: item.unitLabel,
        name: item.name,
        amount,
        passthroughAmount: 0,
        units: 0,
        status: "confirmed",
      });
      continue;
    }

    const start = item.startOn ? toMonthKey(item.startOn) : wonMonthKey;
    const months = itemMonths(item);
    for (let i = 0; i < months; i++) {
      const monthKey = addMonths(start, i);
      if (item.endOn && monthDiff(toMonthKey(item.endOn), monthKey) > 0) break;
      out.push({
        monthKey,
        itemId: item.id,
        productId: item.productId,
        revenueType: item.revenueType,
        unitLabel: item.unitLabel,
        name: item.name,
        amount: itemMonthlyRevenue(item),
        passthroughAmount: itemMonthlyPassthrough(item),
        units: item.revenueType === "performance" ? item.quantity : 0,
        status: "planned",
      });
    }
  }
  return out;
}
