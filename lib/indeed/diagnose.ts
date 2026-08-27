// ファネル診断 — 表示 → クリック → 応募 のどこが詰まっているかを特定する。
//
// 設計方針は「率の見た目の悪さ」ではなく「直すと応募が何件増えるか」で優先順位を決めること。
// CTR が半分でも表示数が 200 しかない求人より、CTR が 8 割でも表示数が 5 万ある求人のほうが、
// 直したときのリターンは大きい。提案が現場で納得されるかどうかはここで決まる。

import { BENCHMARK_LEVEL_LABEL } from "./benchmark";
import {
  describeSeason,
  periodSeasonIndex,
  seasonFactor,
  seedSeasonCurve,
} from "./season";
import { dayCount, rate, wilsonInterval } from "./stats";
import type {
  AggregatedMetrics,
  FunnelStage,
  JobDiagnosis,
  JobRecord,
  MetricSnapshot,
  SegmentBenchmark,
  StageDiagnosis,
  StageVerdict,
} from "./types";

/** これを下回ると「判定に足りない」とみなす母数 */
export const MIN_IMPRESSIONS_FOR_CTR = 300;
export const MIN_CLICKS_FOR_APPLY = 30;
export const MIN_DAYS_FOR_IMPRESSIONS = 7;

/** 提案に値する最低ライン(月間応募の増加見込み) */
const MIN_MEANINGFUL_GAIN = 0.5;

export const STAGE_LABEL: Record<FunnelStage, string> = {
  impressions: "表示数(検索での露出)",
  ctr: "クリック率(一覧で選ばれる力)",
  apply: "応募率(詳細を見た人が応募する力)",
};

/** 複数期間のスナップショットを 1 つに合計する */
export function aggregate(snapshots: MetricSnapshot[]): AggregatedMetrics {
  let impressions = 0;
  let clicks = 0;
  let applies = 0;
  let cost = 0;
  let hasCost = false;
  let days = 0;

  for (const s of snapshots) {
    impressions += s.impressions;
    clicks += s.clicks;
    applies += s.applies;
    if (typeof s.cost === "number") {
      cost += s.cost;
      hasCost = true;
    }
    days += dayCount(s.periodStart, s.periodEnd);
  }
  days = Math.max(days, 1);

  const ctr = rate(clicks, impressions);
  const applyRate = rate(applies, clicks);

  return {
    impressions,
    clicks,
    applies,
    cost: hasCost ? cost : undefined,
    days,
    ctr,
    applyRate,
    overallRate: rate(applies, impressions),
    impressionsPerDay: impressions / days,
    appliesPerDay: applies / days,
    costPerDay: hasCost ? cost / days : undefined,
    cpc: hasCost && clicks > 0 ? cost / clicks : undefined,
    cpa: hasCost && applies > 0 ? cost / applies : undefined,
  };
}

/** 期間の新しい順に並べ替える */
export function sortSnapshots(snapshots: MetricSnapshot[]): MetricSnapshot[] {
  return [...snapshots].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
}

function verdictFor(
  value: number,
  ci: { low: number; high: number },
  bm: { center: number; p25: number; p75: number },
  sufficient: boolean
): StageVerdict {
  if (!sufficient) return "insufficient";
  if (value >= bm.p75 || ci.low > bm.center) return "good";
  // 信頼区間の上端が中央値を下回る = ブレではなく本当に低いと言い切れる
  if (ci.high < bm.center) return "weak";
  return "average";
}

function pct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

/**
 * ベンチマークを、診断対象の期間の季節に合わせて補正する。
 *
 * ベンチマークは年間を通した平均的な水準なので、お盆や年末年始のデータを
 * そのままぶつけると、季節で落ちているだけの求人まで「要改善」と判定してしまう。
 * その期間の季節指数で基準側を下げ、同じ時期どうしで比べられるようにする。
 */
function adjustBenchmarkForSeason(
  benchmark: SegmentBenchmark,
  index: number
): { adjusted: SegmentBenchmark; index: number } {
  if (Math.abs(index - 1) < 0.02) return { adjusted: benchmark, index };
  const scale = (b: SegmentBenchmark["ctr"], metric: "ctr" | "apply" | "impressions") => {
    const f = seasonFactor(index, metric);
    return { center: b.center * f, p25: b.p25 * f, p75: b.p75 * f };
  };
  return {
    index,
    adjusted: {
      ...benchmark,
      ctr: scale(benchmark.ctr, "ctr"),
      applyRate: scale(benchmark.applyRate, "apply"),
      impressionsPerDay: scale(benchmark.impressionsPerDay, "impressions"),
    },
  };
}

export function diagnoseJob(
  job: JobRecord,
  snapshots: MetricSnapshot[],
  rawBenchmark: SegmentBenchmark,
  /** 季節補正のカーブ。省略時は業種・雇用形態のシード値を使う */
  seasonCurve?: number[]
): JobDiagnosis {
  const m = aggregate(snapshots);

  // 診断対象の期間が、平年と比べてどういう時期かを求める
  const curve = seasonCurve ?? seedSeasonCurve(job.industry, job.employmentType);
  const starts = snapshots.map((s) => s.periodStart).sort();
  const ends = snapshots.map((s) => s.periodEnd).sort();
  const seasonIndexValue =
    starts.length > 0
      ? periodSeasonIndex(starts[0], ends[ends.length - 1], curve)
      : 1;
  const { adjusted: benchmark } = adjustBenchmarkForSeason(
    rawBenchmark,
    seasonIndexValue
  );
  const scale = 30 / m.days; // 月間換算

  const ctrOk = m.impressions >= MIN_IMPRESSIONS_FOR_CTR;
  const applyOk = m.clicks >= MIN_CLICKS_FOR_APPLY;
  const daysOk = m.days >= MIN_DAYS_FOR_IMPRESSIONS;

  // 母数が足りない指標は、その求人の実測ではなくベンチマークで代用して試算する。
  // (「クリック 3 件で応募 0 件だから応募率 0%」のような判断を避けるため)
  const ctrForCalc = ctrOk ? m.ctr : benchmark.ctr.center;
  const applyForCalc = applyOk ? m.applyRate : benchmark.applyRate.center;

  const ctrCi = wilsonInterval(m.clicks, m.impressions);
  const applyCi = wilsonInterval(m.applies, m.clicks);

  // --- 表示数 ---
  const ipd = m.impressionsPerDay;
  const ipdBm = benchmark.impressionsPerDay;
  const impressionGain = Math.max(
    0,
    (ipdBm.p75 - ipd) * 30 * ctrForCalc * applyForCalc
  );
  const impressionRealistic = Math.max(
    0,
    (ipdBm.center - ipd) * 30 * ctrForCalc * applyForCalc
  );
  const impressionStage: StageDiagnosis = {
    stage: "impressions",
    label: STAGE_LABEL.impressions,
    verdict: !daysOk
      ? "insufficient"
      : ipd >= ipdBm.p75
        ? "good"
        : ipd < ipdBm.p25
          ? "weak"
          : "average",
    value: ipd,
    benchmark: ipdBm.center,
    target: ipdBm.p75,
    ratio: ipdBm.center > 0 ? ipd / ipdBm.center : 1,
    ci: { low: ipd, high: ipd },
    potentialGain: impressionGain,
    realisticGain: impressionRealistic,
    reason: !daysOk
      ? `集計期間が ${m.days} 日と短く、1 日あたり表示数の判定はまだできません(${MIN_DAYS_FOR_IMPRESSIONS} 日以上を推奨)。`
      : `1 日あたり ${ipd.toFixed(0)} 回表示。同セグメントの基準は ${ipdBm.center.toFixed(0)} 回/日、上位 25% は ${ipdBm.p75.toFixed(0)} 回/日。` +
        (ipd < ipdBm.p25
          ? " 求職者の検索結果にそもそも出ていない状態です。"
          : ipd >= ipdBm.p75
            ? " 露出量は十分に確保できています。"
            : " 露出量は標準的です。"),
  };

  // --- CTR ---
  const ctrGain = Math.max(
    0,
    m.impressions * (benchmark.ctr.p75 - m.ctr) * applyForCalc * scale
  );
  const ctrRealistic = Math.max(
    0,
    m.impressions * (benchmark.ctr.center - m.ctr) * applyForCalc * scale
  );
  const ctrVerdict = verdictFor(m.ctr, ctrCi, benchmark.ctr, ctrOk);
  const ctrStage: StageDiagnosis = {
    stage: "ctr",
    label: STAGE_LABEL.ctr,
    verdict: ctrVerdict,
    value: m.ctr,
    benchmark: benchmark.ctr.center,
    target: benchmark.ctr.p75,
    ratio: benchmark.ctr.center > 0 ? m.ctr / benchmark.ctr.center : 1,
    ci: ctrCi,
    potentialGain: ctrOk ? ctrGain : 0,
    realisticGain: ctrOk ? ctrRealistic : 0,
    reason: !ctrOk
      ? `表示数が ${m.impressions.toLocaleString()} 回と少なく、クリック率はまだ評価できません(${MIN_IMPRESSIONS_FOR_CTR} 回以上で判定します)。`
      : `${pct(m.ctr)}(95% 信頼区間 ${pct(ctrCi.low)}〜${pct(ctrCi.high)})。基準は ${pct(benchmark.ctr.center)}、上位 25% は ${pct(benchmark.ctr.p75)}。` +
        (ctrVerdict === "weak"
          ? " 一覧に出ているのに選ばれていません。タイトル・給与・キャッチコピーなど、一覧画面で見える情報に原因があります。"
          : ctrVerdict === "good"
            ? " 一覧での見え方は機能しています。"
            : " ばらつきの範囲内で、基準と差があるとは言い切れません。"),
  };

  // --- 応募率 ---
  const applyGain = Math.max(
    0,
    m.clicks * (benchmark.applyRate.p75 - m.applyRate) * scale
  );
  const applyRealistic = Math.max(
    0,
    m.clicks * (benchmark.applyRate.center - m.applyRate) * scale
  );
  const applyVerdict = verdictFor(
    m.applyRate,
    applyCi,
    benchmark.applyRate,
    applyOk
  );
  const applyStage: StageDiagnosis = {
    stage: "apply",
    label: STAGE_LABEL.apply,
    verdict: applyVerdict,
    value: m.applyRate,
    benchmark: benchmark.applyRate.center,
    target: benchmark.applyRate.p75,
    ratio: benchmark.applyRate.center > 0 ? m.applyRate / benchmark.applyRate.center : 1,
    ci: applyCi,
    potentialGain: applyOk ? applyGain : 0,
    realisticGain: applyOk ? applyRealistic : 0,
    reason: !applyOk
      ? `クリック数が ${m.clicks.toLocaleString()} 件と少なく、応募率はまだ評価できません(${MIN_CLICKS_FOR_APPLY} 件以上で判定します)。`
      : `${pct(m.applyRate)}(95% 信頼区間 ${pct(applyCi.low)}〜${pct(applyCi.high)})。基準は ${pct(benchmark.applyRate.center)}、上位 25% は ${pct(benchmark.applyRate.p75)}。` +
        (applyVerdict === "weak"
          ? " 求人詳細まで来ているのに応募されていません。仕事内容の書き方・条件の伝わり方・応募フォームのどれかで離脱しています。"
          : applyVerdict === "good"
            ? " 詳細ページの内容は応募につながっています。"
            : " ばらつきの範囲内で、基準と差があるとは言い切れません。"),
  };

  const stages = [impressionStage, ctrStage, applyStage];

  // --- ボトルネックの決定 ---
  // まず「統計的に基準を下回っている段階」から、伸びしろ(応募増の見込み)が最大のものを選ぶ。
  // 明確に弱い段階がなければ、標準的な段階のうち伸びしろが大きいものを選ぶ。
  const pick = (list: StageDiagnosis[]) =>
    list
      .filter((s) => s.potentialGain >= MIN_MEANINGFUL_GAIN)
      .sort((a, b) => b.potentialGain - a.potentialGain)[0];

  const bottleneckStage =
    pick(stages.filter((s) => s.verdict === "weak")) ??
    pick(stages.filter((s) => s.verdict === "average"));
  const bottleneck = bottleneckStage?.stage ?? null;

  const dataMessages: string[] = [];
  if (!ctrOk) dataMessages.push("表示数が少なくクリック率は判定保留");
  if (!applyOk) dataMessages.push("クリック数が少なく応募率は判定保留");
  if (!daysOk) dataMessages.push("集計期間が短く露出量は判定保留");

  const summary = buildSummary(job, m, stages, bottleneckStage, benchmark);

  return {
    jobId: job.id,
    metrics: m,
    benchmark,
    season: {
      index: seasonIndexValue,
      label: describeSeason(seasonIndexValue),
      adjusted: Math.abs(seasonIndexValue - 1) >= 0.02,
    },
    stages,
    bottleneck,
    summary,
    dataSufficiency: {
      ctrOk,
      applyOk,
      message:
        dataMessages.length > 0
          ? `${dataMessages.join(" / ")}。実績を追加登録すると診断精度が上がります。`
          : "判定に十分なデータ量があります。",
    },
  };
}

/**
 * 求人 1 件の「現実的な伸びしろ」(月間応募の増加見込み)。
 *
 * 上位25%ではなく基準並みまでを本線にする。大きく下回っている求人に
 * 「上位25%まで行けます」と言うのは過大な期待になるため。
 * また、クリック率・応募率がまだ評価できない求人は、ベンチマーク由来の率で
 * 応募数を試算しても数字が独り歩きするだけなので 0 として扱う。
 * 合計や並び替えに使う数字は必ずこれに統一する。
 */
export function jobHeadroom(diagnosis: JobDiagnosis): number {
  const [, ctr, apply] = diagnosis.stages;
  if (ctr.verdict === "insufficient" && apply.verdict === "insufficient") {
    return 0;
  }
  return Math.max(0, ...diagnosis.stages.map((s) => s.realisticGain));
}

function buildSummary(
  job: JobRecord,
  m: AggregatedMetrics,
  stages: StageDiagnosis[],
  bottleneck: StageDiagnosis | undefined,
  benchmark: SegmentBenchmark
): string {
  const head =
    `直近 ${m.days} 日で 表示 ${m.impressions.toLocaleString()} → クリック ${m.clicks.toLocaleString()}(${pct(m.ctr)}) → 応募 ${m.applies.toLocaleString()}(${pct(m.applyRate)})。` +
    `比較基準は「${benchmark.label}」(${BENCHMARK_LEVEL_LABEL[benchmark.level]}${benchmark.level === "seed" ? "" : `・${benchmark.jobCount} 件の実績から算出`})。`;

  if (!bottleneck) {
    const anyInsufficient = stages.some((s) => s.verdict === "insufficient");
    return (
      head +
      (anyInsufficient
        ? " まだ判定に足りない指標があります。もう 1 期間ぶん実績を登録してください。"
        : " 3 段階とも基準を下回っておらず、原稿・設定に明確な課題は見当たりません。露出量を増やす投資判断のフェーズです。")
    );
  }

  return (
    head +
    ` 最も伸びしろが大きいのは【${bottleneck.label}】で、基準比 ${(bottleneck.ratio * 100).toFixed(0)}%。` +
    `ここを同セグメント上位 25% の水準まで戻すと、月間の応募が約 ${bottleneck.potentialGain.toFixed(1)} 件増える計算です。`
  );
}
