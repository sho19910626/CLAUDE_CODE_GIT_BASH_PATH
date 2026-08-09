// 施策の効果測定 — このツールの「学習」の中核その 2。
//
// ベンチマーク(benchmark.ts)が学ぶのは「何が普通か」。
// ここで学ぶのは「何をやると効くか」。
//
// 仕組み:
//   1. 施策を記録する(いつ・どの求人に・どの施策を打ったか)
//   2. 施策日の前後の実績を突き合わせ、CTR / 応募率の相対リフトを測る
//   3. 施策 ID ごとにリフトを集計し、シード値から実測値へ徐々に置き換える
//   4. 提案の並び順に、その実測効果量を反映する
//
// 注意している点:
//   - 同じ日に複数施策を打った場合、どれが効いたかは分離できない。
//     1/n の重みで全施策に按分し、観測の重みも下げる(sharedWith に記録)。
//   - 母数が小さい前後比較はノイズなので、最低母数を満たすものだけ採用する。
//   - 統計的に有意でない観測も捨てずに使うが、有意なものより重みを下げる。
//     (求人 1 件ごとの母数は小さく、有意なものだけでは何年も学習が進まないため)

import { actionById } from "./playbook";
import {
  dayCount,
  proportionsDiffer,
  rate,
  relativeLift,
  weightedMean,
} from "./stats";
import type {
  FunnelStage,
  IndustryId,
  Intervention,
  JobRecord,
  LearnedEffect,
  LiftObservation,
  MetricSnapshot,
} from "./types";

/** 前後比較に使う期間(日)。長すぎると季節要因が混ざる */
const WINDOW_DAYS = 42;

/** 前後それぞれに必要な最低母数 */
const MIN_IMPRESSIONS = 500;
const MIN_CLICKS = 25;

/** シード値の強さ。実測がこの件数集まると、実測とシードが 50:50 になる */
const SEED_STRENGTH = 3;

/** 有意でない観測の重み(有意なものを 1.0 とする) */
const NON_SIGNIFICANT_WEIGHT = 0.4;

/** 期間が施策日より前か後かを判定して、該当ぶんを合計する */
function sumWindow(
  snapshots: MetricSnapshot[],
  date: string,
  side: "before" | "after"
): { impressions: number; clicks: number; applies: number; days: number } {
  const pivot = Date.parse(date);
  const limit = WINDOW_DAYS * 86_400_000;
  let impressions = 0;
  let clicks = 0;
  let applies = 0;
  let days = 0;

  for (const s of snapshots) {
    const start = Date.parse(s.periodStart);
    const end = Date.parse(s.periodEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    // 施策日をまたぐ期間は、どちらの効果か分離できないので捨てる
    if (side === "before") {
      if (end >= pivot) continue;
      if (pivot - end > limit) continue;
    } else {
      if (start < pivot) continue;
      if (start - pivot > limit) continue;
    }
    impressions += s.impressions;
    clicks += s.clicks;
    applies += s.applies;
    days += dayCount(s.periodStart, s.periodEnd);
  }
  return { impressions, clicks, applies, days };
}

/** 施策 1 件から観測できる効果をすべて取り出す */
export function measureIntervention(
  intervention: Intervention,
  job: JobRecord,
  snapshots: MetricSnapshot[]
): LiftObservation[] {
  const before = sumWindow(snapshots, intervention.date, "before");
  const after = sumWindow(snapshots, intervention.date, "after");
  const out: LiftObservation[] = [];
  const shared = Math.max(1, intervention.actionIds.length);

  for (const actionId of intervention.actionIds) {
    const action = actionById(actionId);
    if (!action) continue;

    let b: number;
    let a: number;
    let bn: number;
    let an: number;

    if (action.stage === "apply") {
      if (before.clicks < MIN_CLICKS || after.clicks < MIN_CLICKS) continue;
      b = rate(before.applies, before.clicks);
      a = rate(after.applies, after.clicks);
      bn = before.clicks;
      an = after.clicks;
    } else if (action.stage === "ctr") {
      if (before.impressions < MIN_IMPRESSIONS || after.impressions < MIN_IMPRESSIONS)
        continue;
      b = rate(before.clicks, before.impressions);
      a = rate(after.clicks, after.impressions);
      bn = before.impressions;
      an = after.impressions;
    } else {
      // 表示数は比率ではないので 1 日あたり表示数で比較する
      if (before.days < 7 || after.days < 7) continue;
      b = before.impressions / before.days;
      a = after.impressions / after.days;
      bn = before.impressions;
      an = after.impressions;
    }

    const lift = relativeLift(b, a);
    if (lift === null || !Number.isFinite(lift)) continue;

    const significant =
      action.stage === "impressions"
        ? Math.abs(lift) > 0.3 // 表示数は検定できないので実務的な閾値で代用
        : proportionsDiffer(
            action.stage === "apply" ? before.applies : before.clicks,
            bn,
            action.stage === "apply" ? after.applies : after.clicks,
            an
          );

    out.push({
      interventionId: intervention.id,
      jobId: job.id,
      industry: job.industry,
      actionId,
      stage: action.stage,
      before: b,
      after: a,
      lift,
      sharedWith: shared,
      significant,
      beforeDenominator: bn,
      afterDenominator: an,
    });
  }
  return out;
}

/** 登録済みの全施策から観測を作る */
export function measureAll(
  jobs: JobRecord[],
  snapshots: MetricSnapshot[],
  interventions: Intervention[]
): LiftObservation[] {
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const byJob = new Map<string, MetricSnapshot[]>();
  for (const s of snapshots) {
    const list = byJob.get(s.jobId);
    if (list) list.push(s);
    else byJob.set(s.jobId, [s]);
  }

  const out: LiftObservation[] = [];
  for (const iv of interventions) {
    const job = jobById.get(iv.jobId);
    if (!job) continue;
    out.push(...measureIntervention(iv, job, byJob.get(iv.jobId) ?? []));
  }
  return out;
}

/** 観測 1 件の重み。同時実施が多いほど、有意でないほど軽くする */
function observationWeight(o: LiftObservation): number {
  return (1 / o.sharedWith) * (o.significant ? 1 : NON_SIGNIFICANT_WEIGHT);
}

/** 極端な外れ値を丸める(1 件の異常値で提案順が壊れるのを防ぐ) */
function winsorize(lift: number): number {
  return Math.max(-0.8, Math.min(3.0, lift));
}

export interface EffectIndex {
  /** 施策 ID(必要なら業種別)の学習済み効果量を引く */
  get(actionId: string, industry?: IndustryId): LearnedEffect;
  /** 全施策の学習状況(画面表示用)。観測のあるものだけ */
  learned: (LearnedEffect & { stage: FunnelStage; title: string })[];
  observations: LiftObservation[];
}

export function buildEffectIndex(
  observations: LiftObservation[]
): EffectIndex {
  const byAction = new Map<string, LiftObservation[]>();
  for (const o of observations) {
    const list = byAction.get(o.actionId);
    if (list) list.push(o);
    else byAction.set(o.actionId, [o]);
  }

  function compute(actionId: string, industry?: IndustryId): LearnedEffect {
    const action = actionById(actionId);
    const seed = action?.seedLift ?? 0.1;
    const all = byAction.get(actionId) ?? [];

    // 業種指定があれば、その業種の観測を優先しつつ、他業種も 1/3 の重みで使う。
    // (同じ施策は業種をまたいでもある程度は同じ方向に効くという前提)
    const scoped = industry
      ? all.map((o) => ({ o, scope: o.industry === industry ? 1 : 1 / 3 }))
      : all.map((o) => ({ o, scope: 1 }));

    const items = scoped.map(({ o, scope }) => ({
      value: winsorize(o.lift),
      weight: observationWeight(o) * scope,
    }));
    const totalWeight = items.reduce((s, i) => s + i.weight, 0);

    const measured =
      items.length > 0 ? weightedMean(items, seed) : null;

    // シード値を「SEED_STRENGTH 件ぶんの観測」として混ぜる。
    // 実測が積み上がるほどシードの影響は自然に消える。
    const expectedLift =
      (measured !== null ? measured * totalWeight : 0) + seed * SEED_STRENGTH;
    const denom = totalWeight + SEED_STRENGTH;

    const wins = all.filter((o) => o.lift > 0).length;

    return {
      actionId,
      expectedLift: denom > 0 ? expectedLift / denom : seed,
      measuredLift: measured,
      sampleSize: all.length,
      winRate: all.length > 0 ? wins / all.length : null,
      confidence: totalWeight / (totalWeight + SEED_STRENGTH),
    };
  }

  const learned = [...byAction.keys()]
    .map((id) => {
      const action = actionById(id);
      return {
        ...compute(id),
        stage: action?.stage ?? ("ctr" as FunnelStage),
        title: action?.title ?? id,
      };
    })
    .sort((a, b) => (b.measuredLift ?? 0) - (a.measuredLift ?? 0));

  return { get: compute, learned, observations };
}

/** 施策 1 件の測定結果を画面に出すためのまとめ */
export interface InterventionReport {
  intervention: Intervention;
  job: JobRecord | undefined;
  observations: LiftObservation[];
  /** 測定できなかった理由(観測が 0 件のとき) */
  pendingReason?: string;
}

export function reportInterventions(
  jobs: JobRecord[],
  snapshots: MetricSnapshot[],
  interventions: Intervention[]
): InterventionReport[] {
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const byJob = new Map<string, MetricSnapshot[]>();
  for (const s of snapshots) {
    const list = byJob.get(s.jobId);
    if (list) list.push(s);
    else byJob.set(s.jobId, [s]);
  }

  return [...interventions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((iv) => {
      const job = jobById.get(iv.jobId);
      const snaps = byJob.get(iv.jobId) ?? [];
      const observations = job ? measureIntervention(iv, job, snaps) : [];
      let pendingReason: string | undefined;

      if (observations.length === 0) {
        const before = sumWindow(snaps, iv.date, "before");
        const after = sumWindow(snaps, iv.date, "after");
        if (before.impressions === 0)
          pendingReason = "施策日より前の実績が登録されていません。";
        else if (after.impressions === 0)
          pendingReason = "施策日より後の実績がまだありません。次回の数値を登録すると効果を測定します。";
        else
          pendingReason = `前後の母数が不足しています(前 ${before.impressions.toLocaleString()} 表示 / 後 ${after.impressions.toLocaleString()} 表示)。もう少し期間を空けて登録してください。`;
      }

      return { intervention: iv, job, observations, pendingReason };
    });
}
