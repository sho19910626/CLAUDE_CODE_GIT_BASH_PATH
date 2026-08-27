// お金の分析。
//
// Indeed 運用代行の仕事は、突き詰めると「いくら払って何件採れたか」なので、
// 表示・クリック・応募の 3 段階だけを見ていても半分しか診られない。
//
// このファイルがやることは 1 つだけ:
//   応募単価が高いとき、原因が「クリックが高い」のか「応募率が低い」のかを分ける。
//
//   応募単価 = クリック単価 ÷ 応募率
//
// この分解が要るのは、打ち手がまったく別物だから。
//   クリックが高い → 入札・キーワード・競合の問題(管理画面側)
//   応募率が低い   → 原稿と応募フローの問題(原稿側)
// ここを取り違えると、原稿をいくら直しても単価は下がらない。
//
// 比較の相場は、世間の平均値ではなく「自社の同じ業種・職種の求人」から取る。
// 単価はエリアと時期で大きく振れるので、他社の平均を基準に据えるほうが危険なため。

import { normalizeCategory } from "./benchmark";
import { aggregate } from "./diagnose";
import type {
  CostBreakdown,
  JobRecord,
  MetricSnapshot,
} from "./types";

/** 相場として使うのに最低限必要な求人数。これ未満なら「相場は出せない」とする */
const MIN_JOBS_FOR_MARKET = 3;

/** 相場からこの割合を超えて外れていたら「高い」と見なす */
const HIGH_THRESHOLD = 1.2;

interface Sample {
  jobId: string;
  industry: string;
  category: string;
  employmentType: string;
  cpc: number;
  cpa?: number;
}

export interface CostMarket {
  /** 参考にした求人数 */
  jobCount: number;
  label: string;
  medianCpc: number;
  medianCpa?: number;
}

export interface CostIndex {
  /** 費用が入っている求人の数。0 なら費用の分析は一切できない */
  jobsWithCost: number;
  forJob(job: JobRecord): CostMarket | null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** 職種の突き合わせは、ベンチマークと同じ正規化を使う(表記ゆれを吸収する) */
function categoryKey(job: JobRecord): string {
  return normalizeCategory(job.jobCategory || job.name);
}

/**
 * 求人ごとの単価を集めて、段階的に広い相場を用意する。
 *
 * 狭い順に見て、最初に「求人が 3 件以上ある」ところを相場として使う。
 * 業種×職種×雇用形態 → 業種×雇用形態 → 業種 → 全体
 */
export function buildCostIndex(
  jobs: JobRecord[],
  snapshots: MetricSnapshot[]
): CostIndex {
  const byJob = new Map<string, MetricSnapshot[]>();
  for (const s of snapshots) {
    const list = byJob.get(s.jobId);
    if (list) list.push(s);
    else byJob.set(s.jobId, [s]);
  }

  const samples: Sample[] = [];
  for (const job of jobs) {
    const m = aggregate(byJob.get(job.id) ?? []);
    // 費用が入っていない、またはクリックが無い求人は相場の材料にしない
    if (m.cpc === undefined || m.clicks === 0) continue;
    samples.push({
      jobId: job.id,
      industry: job.industry,
      category: categoryKey(job),
      employmentType: job.employmentType,
      cpc: m.cpc,
      cpa: m.cpa,
    });
  }

  const market = (
    label: string,
    pool: Sample[],
    exceptJobId: string
  ): CostMarket | null => {
    // 自分自身を相場に含めると「自分と比べて普通」になってしまう
    const others = pool.filter((s) => s.jobId !== exceptJobId);
    if (others.length < MIN_JOBS_FOR_MARKET) return null;
    const cpas = others.map((s) => s.cpa).filter((v): v is number => v !== undefined);
    return {
      jobCount: others.length,
      label,
      medianCpc: median(others.map((s) => s.cpc)),
      medianCpa: cpas.length >= MIN_JOBS_FOR_MARKET ? median(cpas) : undefined,
    };
  };

  return {
    jobsWithCost: samples.length,
    forJob(job) {
      const cat = categoryKey(job);
      return (
        market(
          "同じ業種・職種・雇用形態",
          samples.filter(
            (s) =>
              s.industry === job.industry &&
              s.category === cat &&
              s.employmentType === job.employmentType
          ),
          job.id
        ) ??
        market(
          "同じ業種・雇用形態",
          samples.filter(
            (s) =>
              s.industry === job.industry && s.employmentType === job.employmentType
          ),
          job.id
        ) ??
        market(
          "同じ業種",
          samples.filter((s) => s.industry === job.industry),
          job.id
        ) ??
        market("登録済みの全求人", samples, job.id)
      );
    },
  };
}

/**
 * 応募単価の内訳を出す。
 *
 * 「クリック単価だけ相場に戻したら応募単価はいくらになるか」
 * 「応募率だけ相場に戻したらいくらになるか」を並べて示すことで、
 * どちらを直すほうが効くのかが数字で分かるようにする。
 */
export function breakdownCost(
  cpc: number,
  applyRate: number,
  marketCpc: number | undefined,
  marketApplyRate: number | undefined
): CostBreakdown {
  const cpa = applyRate > 0 ? cpc / applyRate : Number.POSITIVE_INFINITY;

  const cpcHigh = marketCpc !== undefined && cpc > marketCpc * HIGH_THRESHOLD;
  const rateLow =
    marketApplyRate !== undefined && applyRate < marketApplyRate / HIGH_THRESHOLD;

  const driver: CostBreakdown["driver"] =
    cpcHigh && rateLow ? "both" : cpcHigh ? "cpc" : rateLow ? "applyRate" : "none";

  return {
    cpa,
    cpc,
    applyRate,
    benchmarkCpc: marketCpc,
    benchmarkCpa:
      marketCpc !== undefined && marketApplyRate !== undefined && marketApplyRate > 0
        ? marketCpc / marketApplyRate
        : undefined,
    driver,
    // クリック単価だけを相場に戻した場合
    cpaIfCpcFixed:
      cpcHigh && applyRate > 0 && marketCpc !== undefined
        ? marketCpc / applyRate
        : undefined,
    // 応募率だけを相場に戻した場合
    cpaIfApplyRateFixed:
      rateLow && marketApplyRate !== undefined && marketApplyRate > 0
        ? cpc / marketApplyRate
        : undefined,
  };
}

/**
 * 日ごとの費用がほぼ同額で並んでいるか。
 *
 * そろっていれば、日予算の上限に張り付いている(＝使い切っている)可能性が高い。
 * 「表示が伸びない」原因が原稿ではなく予算不足だと分かるので、
 * 管理画面を見に行かなくても切り分けができる。
 */
export function looksBudgetCapped(snapshots: MetricSnapshot[]): {
  capped: boolean;
  dailyCost?: number;
  days: number;
} {
  // 1 日単位で記録されているものだけを見る(週次・月次の行は判定に使えない)
  const daily = snapshots
    .filter((s) => s.periodStart === s.periodEnd && typeof s.cost === "number")
    .map((s) => s.cost as number)
    .filter((c) => c > 0);

  if (daily.length < 5) return { capped: false, days: daily.length };

  const avg = daily.reduce((a, b) => a + b, 0) / daily.length;
  if (avg <= 0) return { capped: false, days: daily.length };

  // 平均から 5% 以内に収まっている日が 8 割以上あれば、上限に当たっていると見る
  const near = daily.filter((c) => Math.abs(c - avg) / avg <= 0.05).length;
  return {
    capped: near / daily.length >= 0.8,
    dailyCost: Math.round(avg),
    days: daily.length,
  };
}
