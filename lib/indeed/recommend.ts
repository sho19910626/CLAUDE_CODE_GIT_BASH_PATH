// 提案の生成とランキング。
//
// 診断(どこが詰まっているか)× カタログ(何をやると効くか)× 学習(実際に効いたか)
// の 3 つを掛け合わせて、「この求人で次にやるべきこと」を順番に並べる。
//
// 並び順の根拠:
//   期待応募増 = min( 現在の月間応募数 × その施策の期待リフト率 , その段階の伸びしろ上限 )
//   優先度     = 期待応募増 ÷ 実施の重さ
//
// 「率が一番悪いところ」ではなく「直したときに応募が一番増えるところ」から並ぶので、
// 表示数の少ない求人の CTR を細かく直すような、労力に見合わない提案が上に来ない。
//
// 注意: 各提案の期待応募増は「その施策を単独で実施した場合」の見込みで、足し算はできない。

import { buildBenchmarks, normalizeCategory, type BenchmarkIndex } from "./benchmark";
import { analyzeCatch, analyzeDescription, analyzeTitle } from "./copycheck";
import { aggregate, diagnoseJob, jobHeadroom } from "./diagnose";
import { buildEffectIndex, measureAll, type EffectIndex } from "./learn";
import { PLAYBOOK, type ActionContext, type WageMarket } from "./playbook";
import { employmentDef, employmentLabel, industryDef } from "./seed";
import { percentile } from "./stats";
import type {
  FunnelStage,
  IndeedStore,
  JobDiagnosis,
  JobRecord,
  MetricSnapshot,
  Recommendation,
  StageDiagnosis,
} from "./types";

/** 提案対象にする最低の伸びしろ(月間応募の増加見込み) */
const MIN_STAGE_GAIN = 0.3;

/** 原稿未登録で条件を確認できていない提案は、優先度を割り引く */
const UNVERIFIED_PENALTY = 0.8;

/**
 * 段階の判定による優先度の重み。
 * 「統計的に基準を下回っていると言い切れる段階」の改善を、
 * 「基準との差がブレの範囲内な段階」の改善より優先する。
 */
const STAGE_WEIGHT: Record<string, number> = {
  weak: 1,
  average: 0.7,
  good: 0.5,
  insufficient: 0,
};

// ===== 給与相場 =====

export interface WageMarketIndex {
  forJob(job: JobRecord): WageMarket | undefined;
}

const WAGE_UNIT_LABEL: Record<string, string> = {
  hourly: "時給",
  daily: "日給",
  monthly: "月給",
  annual: "年収",
};

/**
 * 登録済みの求人から給与相場を作る。
 * 求人が増えるほど「同じ地域の同じ職種で、いくらが普通か」が正確になり、
 * 「相場より 12% 低い」という具体的な根拠つきで提案できるようになる。
 */
export function buildWageMarket(jobs: JobRecord[]): WageMarketIndex {
  interface Entry {
    jobId: string;
    value: number;
    industry: string;
    category: string;
    employment: string;
    prefecture: string;
    type: string;
  }
  const entries: Entry[] = [];
  for (const j of jobs) {
    const v = j.wage?.min;
    if (!v || v <= 0) continue;
    entries.push({
      jobId: j.id,
      value: v,
      industry: j.industry,
      category: normalizeCategory(j.jobCategory),
      employment: j.employmentType,
      prefecture: j.prefecture,
      type: j.wage!.type,
    });
  }

  function collect(job: JobRecord, level: 0 | 1 | 2): number[] {
    const cat = normalizeCategory(job.jobCategory);
    const type = job.wage?.type ?? employmentDef(job.employmentType).wageUnit;
    return entries
      .filter((e) => {
        // 自分自身を相場に含めると、件数が少ないときに中央値が自分に引っ張られ、
        // 相場との差が実際より小さく見えてしまう
        if (e.jobId === job.id) return false;
        if (e.type !== type) return false;
        if (e.employment !== job.employmentType) return false;
        if (level >= 1 && e.industry !== job.industry) return false;
        if (level >= 2 && e.category !== cat) return false;
        // 同一都道府県で比較できるならそのほうが精度が高い
        if (level >= 1 && e.prefecture !== job.prefecture) return false;
        return true;
      })
      .map((e) => e.value);
  }

  return {
    forJob(job) {
      const type = job.wage?.type ?? employmentDef(job.employmentType).wageUnit;
      // 細かい順に試し、3 件以上集まった粒度を採用する
      for (const level of [2, 1, 0] as const) {
        const values = collect(job, level);
        if (values.length >= 3) {
          return {
            median: percentile(values, 0.5),
            p75: percentile(values, 0.75),
            sampleSize: values.length,
            unit: WAGE_UNIT_LABEL[type] ?? "給与",
          };
        }
      }
      return undefined;
    },
  };
}

// ===== 提案の生成 =====

function daysSince(dateStr: string | undefined): number | undefined {
  if (!dateStr) return undefined;
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return undefined;
  return Math.max(0, Math.round((Date.now() - t) / 86_400_000));
}

export function buildRecommendations(
  job: JobRecord,
  diagnosis: JobDiagnosis,
  effects: EffectIndex,
  wageMarket: WageMarket | undefined
): Recommendation[] {
  const stage = Object.fromEntries(
    diagnosis.stages.map((s) => [s.stage, s])
  ) as Record<FunnelStage, StageDiagnosis>;

  const copy = job.copy ?? {};
  const ctx: ActionContext = {
    job,
    metrics: diagnosis.metrics,
    benchmark: diagnosis.benchmark,
    stage,
    industry: industryDef(job.industry),
    employment: employmentDef(job.employmentType),
    title: copy.title
      ? analyzeTitle(
          copy.title,
          job.prefecture,
          job.city,
          employmentLabel(job.employmentType)
        )
      : undefined,
    catchCopy: copy.catch ? analyzeCatch(copy.catch) : undefined,
    description: copy.description ? analyzeDescription(copy.description) : undefined,
    wageMarket,
    daysSincePosted: daysSince(job.postedAt),
  };

  // 現在の月間応募数。母数不足の求人はベンチマークで推定して 0 割れを防ぐ
  const m = diagnosis.metrics;
  const monthlyApplies =
    m.applies > 0
      ? (m.applies * 30) / m.days
      : m.impressionsPerDay * 30 * diagnosis.benchmark.ctr.center * diagnosis.benchmark.applyRate.center;

  const out: Recommendation[] = [];

  for (const action of PLAYBOOK) {
    if (action.industries && !action.industries.includes(job.industry)) continue;

    const st = stage[action.stage];
    const gateOpen =
      action.ignoreStageGate === true ||
      (st.verdict !== "good" &&
        st.verdict !== "insufficient" &&
        st.potentialGain >= MIN_STAGE_GAIN);
    if (!gateOpen) continue;

    const match = action.when(ctx);
    if (!match) continue;

    const learning = effects.get(action.id, job.industry);
    const cap = st.potentialGain;
    const raw = monthlyApplies * learning.expectedLift;
    const expectedGain = action.ignoreStageGate
      ? raw // 法令対応など、伸びしろ上限とは別軸のもの
      : Math.min(raw, cap);

    out.push({
      actionId: action.id,
      stage: action.stage,
      title: action.title,
      why: action.why,
      how: action.how,
      evidence: match.evidence,
      expectedGain,
      expectedLift: learning.expectedLift,
      effort: action.effort,
      priority:
        (expectedGain / action.effort) *
        (STAGE_WEIGHT[st.verdict] ?? 0.7) *
        (match.unverified ? UNVERIFIED_PENALTY : 1),
      learning,
      unverified: match.unverified === true,
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}

// ===== まとめて分析する入り口 =====

export interface JobAnalysis {
  job: JobRecord;
  snapshots: MetricSnapshot[];
  diagnosis: JobDiagnosis;
  recommendations: Recommendation[];
}

export interface StoreAnalysis {
  benchmarks: BenchmarkIndex;
  effects: EffectIndex;
  wageMarket: WageMarketIndex;
  jobs: JobAnalysis[];
  /** 全求人の合計 */
  totals: {
    impressions: number;
    clicks: number;
    applies: number;
    cost?: number;
    ctr: number;
    applyRate: number;
    /** 各求人を同セグメントの基準並みまで戻した場合の、月間応募の増加余地の合計 */
    headroom: number;
  };
}

/**
 * ストア全体を分析する。画面はこの結果だけを見ればよい。
 * 求人が増えるたびにベンチマークと給与相場が更新され、
 * 施策の記録が増えるたびに提案の並び順が変わる。
 */
export function analyzeStore(store: IndeedStore): StoreAnalysis {
  const activeJobs = store.jobs;
  const benchmarks = buildBenchmarks(activeJobs, store.snapshots);
  const effects = buildEffectIndex(
    measureAll(activeJobs, store.snapshots, store.interventions)
  );
  const wageMarket = buildWageMarket(activeJobs);

  const byJob = new Map<string, MetricSnapshot[]>();
  for (const s of store.snapshots) {
    const list = byJob.get(s.jobId);
    if (list) list.push(s);
    else byJob.set(s.jobId, [s]);
  }

  const jobs: JobAnalysis[] = activeJobs.map((job) => {
    const snapshots = (byJob.get(job.id) ?? []).sort((a, b) =>
      a.periodStart.localeCompare(b.periodStart)
    );
    const diagnosis = diagnoseJob(job, snapshots, benchmarks.forJob(job));
    const recommendations = buildRecommendations(
      job,
      diagnosis,
      effects,
      wageMarket.forJob(job)
    );
    return { job, snapshots, diagnosis, recommendations };
  });

  const totalsSource = aggregate(store.snapshots);
  const headroom = jobs.reduce((sum, j) => sum + jobHeadroom(j.diagnosis), 0);

  return {
    benchmarks,
    effects,
    wageMarket,
    jobs,
    totals: {
      impressions: totalsSource.impressions,
      clicks: totalsSource.clicks,
      applies: totalsSource.applies,
      cost: totalsSource.cost,
      ctr: totalsSource.ctr,
      applyRate: totalsSource.applyRate,
      headroom,
    },
  };
}
