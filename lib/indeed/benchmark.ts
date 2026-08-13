// セグメント別ベンチマークの構築 — このツールの「学習」の中核その 1。
//
// 「この業種のこの職種なら、CTR はこのくらいが普通」という基準値を、
// 登録済みの実績データから作る。ポイントは 2 つ:
//
//   1) 階層構造
//      業種 × 職種 × 雇用形態 → 業種 × 雇用形態 → 業種 → 全体 → シード値
//      と 4 段階で親を辿り、細かいセグメントのデータが少なくても、
//      親のデータで補いながら推定する。
//
//   2) 経験ベイズ収縮
//      各階層の推定値は「実測値」と「親の推定値」の加重平均。
//      重みはデータ量そのものなので、データが増えるほど自動的に実測寄りになる。
//      1 件目の登録から破綻せずに動き、100 件貯まれば自前の基準値に置き換わる。
//
// この結果、シード値(seed.ts の暫定値)は使い込むほど影響力を失う。

import {
  SEED_IMPRESSIONS_PER_DAY,
  SEED_IMPRESSION_SPREAD,
  SEED_SPREAD,
  employmentLabel,
  industryLabel,
  seedRates,
} from "./seed";
import {
  clamp,
  dayCount,
  percentile,
  shrink,
  shrinkConfidence,
} from "./stats";
import type {
  BenchmarkLevel,
  IndustryId,
  JobRecord,
  MetricBenchmark,
  MetricSnapshot,
  SegmentBenchmark,
} from "./types";

/** 収縮の強さ。この量のデータが集まると実測値と事前情報が 50:50 になる */
const CTR_PRIOR_STRENGTH = 10_000; // 表示数
const APPLY_PRIOR_STRENGTH = 300; // クリック数
const IPD_PRIOR_STRENGTH = 3; // 求人数

/** その階層を「使える」と判断する最低データ量 */
const MIN_JOBS_FOR_LEVEL = 3;
const MIN_IMPRESSIONS_FOR_LEVEL = 3_000;

/** 四分位を実データから作るのに必要な求人数と、1 求人あたりの最低母数 */
const MIN_JOBS_FOR_PERCENTILE = 5;
const MIN_IMPRESSIONS_PER_JOB = 500;
const MIN_CLICKS_PER_JOB = 30;

/** 求人 1 件を全期間で集計したもの */
export interface JobRollup {
  job: JobRecord;
  impressions: number;
  clicks: number;
  applies: number;
  cost: number;
  days: number;
  snapshotCount: number;
}

interface Bucket {
  key: string;
  impressions: number;
  clicks: number;
  applies: number;
  rollups: JobRollup[];
}

/**
 * 企業ごとの傾向。
 *
 * 同じ職種・同じ雇用形態でも、クライアントによって成果は一貫して上下する。
 * (知名度、職場環境、条件の出し方、応募対応の速さなど)
 * 「その企業の求人が、同セグメントの基準に対してどれだけ上振れ/下振れするか」を
 * 経験ベイズで推定し、考察に反映する。
 */
export interface CompanyEffect {
  company: string;
  /** 1.0 が基準どおり。0.8 ならその企業の求人は基準より 2 割クリックされにくい */
  ctr: number;
  applyRate: number;
  jobCount: number;
  impressions: number;
  clicks: number;
  applies: number;
  /** 実測がどれだけ効いているか (0〜1) */
  confidence: number;
}

export interface BenchmarkIndex {
  /** 求人に対応するベンチマークを引く */
  forJob(job: JobRecord): SegmentBenchmark;
  /** 企業ごとの傾向。データが足りなければ null */
  companyEffect(company: string): CompanyEffect | null;
  /** 蓄積のある企業の一覧(多い順) */
  companies: CompanyEffect[];
  /** 求人 1 件ぶんの集計 */
  rollup(jobId: string): JobRollup | undefined;
  rollups: JobRollup[];
  /** 学習の進み具合(画面表示用) */
  learning: LearningStatus;
}

export interface LearningStatus {
  jobCount: number;
  snapshotCount: number;
  impressions: number;
  clicks: number;
  applies: number;
  /** 全体推定値がどれだけ実測に寄っているか (0〜1) */
  overallConfidence: number;
  /** 自社データがシード想定より上振れ/下振れしている度合い (1.0 = 想定通り) */
  houseFactor: { ctr: number; applyRate: number };
  /** 業種ごとの蓄積状況 */
  byIndustry: {
    industry: IndustryId;
    label: string;
    jobCount: number;
    impressions: number;
    clicks: number;
    applies: number;
    ctr: number;
    applyRate: number;
    confidence: number;
  }[];
}

/** 職種名の表記ゆれを吸収する(空白・大小文字・全角半角の差を無視) */
export function normalizeCategory(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    );
}

const KEY_L3 = (j: JobRecord) =>
  `${j.industry}|${normalizeCategory(j.jobCategory)}|${j.employmentType}`;
const KEY_L2 = (j: JobRecord) => `${j.industry}|${j.employmentType}`;
const KEY_L1 = (j: JobRecord) => j.industry;

/** 求人ごとに全スナップショットを合計する */
export function buildRollups(
  jobs: JobRecord[],
  snapshots: MetricSnapshot[]
): JobRollup[] {
  const byJob = new Map<string, MetricSnapshot[]>();
  for (const s of snapshots) {
    const list = byJob.get(s.jobId);
    if (list) list.push(s);
    else byJob.set(s.jobId, [s]);
  }
  return jobs.map((job) => {
    const list = byJob.get(job.id) ?? [];
    let impressions = 0;
    let clicks = 0;
    let applies = 0;
    let cost = 0;
    let days = 0;
    for (const s of list) {
      impressions += s.impressions;
      clicks += s.clicks;
      applies += s.applies;
      cost += s.cost ?? 0;
      days += dayCount(s.periodStart, s.periodEnd);
    }
    return {
      job,
      impressions,
      clicks,
      applies,
      cost,
      days: Math.max(days, 1),
      snapshotCount: list.length,
    };
  });
}

function addToBucket(map: Map<string, Bucket>, key: string, r: JobRollup) {
  let b = map.get(key);
  if (!b) {
    b = { key, impressions: 0, clicks: 0, applies: 0, rollups: [] };
    map.set(key, b);
  }
  b.impressions += r.impressions;
  b.clicks += r.clicks;
  b.applies += r.applies;
  b.rollups.push(r);
}

/**
 * 目標値(p75)は必ず中心値より最低このぶんは上に置く。
 * 実データが偶然そろって四分位が潰れると、伸びしろが 0 になって
 * 「改善の余地なし」と誤判定してしまうため、下限の帯を保証する。
 */
const MIN_BAND = { p25: 0.85, p75: 1.15 };

/** 中心値と四分位からベンチマークを組み立てる */
function makeBenchmark(
  center: number,
  samples: number[],
  spread: { p25: number; p75: number }
): MetricBenchmark {
  if (samples.length >= MIN_JOBS_FOR_PERCENTILE) {
    const p25 = percentile(samples, 0.25);
    const p75 = percentile(samples, 0.75);
    // 実データの四分位を使いつつ、中心値は収縮済みの推定値に合わせて平行移動する。
    // (少数の外れ値で四分位が中心値と矛盾するのを防ぐ)
    const empiricalMedian = percentile(samples, 0.5) || center;
    const shift = empiricalMedian > 0 ? center / empiricalMedian : 1;
    return {
      center,
      p25: Math.max(0, Math.min(p25 * shift, center * MIN_BAND.p25)),
      p75: Math.max(p75 * shift, center * MIN_BAND.p75),
    };
  }
  return {
    center,
    p25: center * spread.p25,
    p75: center * spread.p75,
  };
}

export function buildBenchmarks(
  jobs: JobRecord[],
  snapshots: MetricSnapshot[]
): BenchmarkIndex {
  const rollups = buildRollups(jobs, snapshots).filter((r) => r.impressions > 0);
  const rollupById = new Map(rollups.map((r) => [r.job.id, r]));

  const l3 = new Map<string, Bucket>();
  const l2 = new Map<string, Bucket>();
  const l1 = new Map<string, Bucket>();
  const byCompany = new Map<string, Bucket>();
  const all: Bucket = { key: "all", impressions: 0, clicks: 0, applies: 0, rollups: [] };

  for (const r of rollups) {
    addToBucket(l3, KEY_L3(r.job), r);
    addToBucket(l2, KEY_L2(r.job), r);
    addToBucket(l1, KEY_L1(r.job), r);
    const company = r.job.company?.trim();
    if (company) addToBucket(byCompany, company, r);
    all.impressions += r.impressions;
    all.clicks += r.clicks;
    all.applies += r.applies;
    all.rollups.push(r);
  }

  // --- ハウスファクター ---
  // 「シード値がこの求人群に対して予測した数値」と「実際の数値」の比。
  // まだデータのない業種にも、この事務所固有の上振れ/下振れを引き継げる。
  let expectedClicks = 0;
  let expectedApplies = 0;
  for (const r of rollups) {
    const s = seedRates(r.job.industry, r.job.employmentType);
    expectedClicks += r.impressions * s.ctr;
    expectedApplies += r.clicks * s.applyRate;
  }
  const houseCtr =
    expectedClicks > 0
      ? clamp(
          shrink(all.clicks, all.impressions, 0.5, CTR_PRIOR_STRENGTH) /
            shrink(expectedClicks, all.impressions, 0.5, CTR_PRIOR_STRENGTH),
          0.4,
          2.5
        )
      : 1;
  const houseApply =
    expectedApplies > 0
      ? clamp(
          shrink(all.applies, all.clicks, 0.5, APPLY_PRIOR_STRENGTH) /
            shrink(expectedApplies, all.clicks, 0.5, APPLY_PRIOR_STRENGTH),
          0.4,
          2.5
        )
      : 1;

  /** 求人単位の率(母数が小さすぎるものは四分位の材料にしない) */
  const ctrSamples = (b: Bucket) =>
    b.rollups
      .filter((r) => r.impressions >= MIN_IMPRESSIONS_PER_JOB)
      .map((r) => r.clicks / r.impressions);
  const applySamples = (b: Bucket) =>
    b.rollups
      .filter((r) => r.clicks >= MIN_CLICKS_PER_JOB)
      .map((r) => r.applies / r.clicks);
  const ipdSamples = (b: Bucket) =>
    b.rollups.map((r) => r.impressions / r.days).filter((v) => v > 0);

  /** 1 日あたり表示数は比率ではないので対数空間で親に寄せる */
  const shrinkIpd = (b: Bucket | null, prior: number): number => {
    if (!b || b.rollups.length === 0) return prior;
    const samples = ipdSamples(b);
    if (samples.length === 0) return prior;
    const observed = percentile(samples, 0.5);
    if (observed <= 0) return prior;
    const n = samples.length;
    const ln =
      (n * Math.log(observed) + IPD_PRIOR_STRENGTH * Math.log(prior)) /
      (n + IPD_PRIOR_STRENGTH);
    return Math.exp(ln);
  };

  function forJob(job: JobRecord): SegmentBenchmark {
    const seed = seedRates(job.industry, job.employmentType);
    const seedIpd =
      job.sponsored === true
        ? SEED_IMPRESSIONS_PER_DAY.sponsored
        : job.sponsored === false
          ? SEED_IMPRESSIONS_PER_DAY.organic
          : SEED_IMPRESSIONS_PER_DAY.unknown;

    const bAll = all.rollups.length > 0 ? all : null;
    const b1 = l1.get(KEY_L1(job)) ?? null;
    const b2 = l2.get(KEY_L2(job)) ?? null;
    const b3 = l3.get(KEY_L3(job)) ?? null;

    // --- 階層をたどりながら収縮させる ---
    // 全体: シード値をこの求人群の構成で加重平均したものが事前情報
    const seedGlobalCtr =
      all.impressions > 0 ? expectedClicks / all.impressions : seed.ctr;
    const seedGlobalApply =
      all.clicks > 0 ? expectedApplies / all.clicks : seed.applyRate;

    const ctrAll = bAll
      ? shrink(bAll.clicks, bAll.impressions, seedGlobalCtr, CTR_PRIOR_STRENGTH)
      : seedGlobalCtr;
    const applyAll = bAll
      ? shrink(bAll.applies, bAll.clicks, seedGlobalApply, APPLY_PRIOR_STRENGTH)
      : seedGlobalApply;

    // 業種: その業種のシード値にハウスファクターを掛けたものが事前情報
    const priorCtr1 = clamp(seed.ctr * houseCtr, 0.002, 0.4);
    const priorApply1 = clamp(seed.applyRate * houseApply, 0.002, 0.6);
    const ctr1 = b1
      ? shrink(b1.clicks, b1.impressions, priorCtr1, CTR_PRIOR_STRENGTH)
      : priorCtr1;
    const apply1 = b1
      ? shrink(b1.applies, b1.clicks, priorApply1, APPLY_PRIOR_STRENGTH)
      : priorApply1;

    // 業種 × 雇用形態
    const ctr2 = b2
      ? shrink(b2.clicks, b2.impressions, ctr1, CTR_PRIOR_STRENGTH)
      : ctr1;
    const apply2 = b2
      ? shrink(b2.applies, b2.clicks, apply1, APPLY_PRIOR_STRENGTH)
      : apply1;

    // 業種 × 職種 × 雇用形態
    const ctr3 = b3
      ? shrink(b3.clicks, b3.impressions, ctr2, CTR_PRIOR_STRENGTH)
      : ctr2;
    const apply3 = b3
      ? shrink(b3.applies, b3.clicks, apply2, APPLY_PRIOR_STRENGTH)
      : apply2;

    const ipdAll = shrinkIpd(bAll, seedIpd);
    const ipd1 = shrinkIpd(b1, ipdAll);
    const ipd2 = shrinkIpd(b2, ipd1);
    const ipd3 = shrinkIpd(b3, ipd2);

    // --- どの粒度を「そのセグメントの基準値」として提示するか ---
    const usable = (b: Bucket | null) =>
      !!b &&
      b.rollups.length >= MIN_JOBS_FOR_LEVEL &&
      b.impressions >= MIN_IMPRESSIONS_FOR_LEVEL;

    let level: BenchmarkLevel;
    let bucket: Bucket | null;
    let ctrCenter: number;
    let applyCenter: number;
    let ipdCenter: number;
    let label: string;

    if (usable(b3)) {
      level = "job-category";
      bucket = b3;
      ctrCenter = ctr3;
      applyCenter = apply3;
      ipdCenter = ipd3;
      label = `${industryLabel(job.industry)} × ${job.jobCategory} × ${employmentLabel(job.employmentType)}`;
    } else if (usable(b2)) {
      level = "industry-employment";
      bucket = b2;
      ctrCenter = ctr2;
      applyCenter = apply2;
      ipdCenter = ipd2;
      label = `${industryLabel(job.industry)} × ${employmentLabel(job.employmentType)}`;
    } else if (usable(b1)) {
      level = "industry";
      bucket = b1;
      ctrCenter = ctr1;
      applyCenter = apply1;
      ipdCenter = ipd1;
      label = industryLabel(job.industry);
    } else if (usable(bAll)) {
      level = "all";
      bucket = bAll;
      // 全体しか使えない場合も、業種のシード補正は効かせたほうが妥当
      ctrCenter = ctr1;
      applyCenter = apply1;
      ipdCenter = ipd1;
      label = "登録済みの全求人";
    } else {
      level = "seed";
      bucket = null;
      ctrCenter = priorCtr1;
      applyCenter = priorApply1;
      ipdCenter = seedIpd;
      label = `${industryLabel(job.industry)}(暫定値)`;
    }

    const cs = bucket ? ctrSamples(bucket) : [];
    const as = bucket ? applySamples(bucket) : [];
    const is = bucket ? ipdSamples(bucket) : [];

    return {
      level,
      jobCount: bucket?.rollups.length ?? 0,
      impressions: bucket?.impressions ?? 0,
      label,
      ctr: makeBenchmark(ctrCenter, cs, SEED_SPREAD),
      applyRate: makeBenchmark(applyCenter, as, SEED_SPREAD),
      impressionsPerDay: makeBenchmark(ipdCenter, is, SEED_IMPRESSION_SPREAD),
    };
  }

  // ===== 企業ごとの傾向 =====
  //
  // その企業の求人それぞれについて「セグメントの基準ならこのくらいのクリックが出るはず」を
  // 積み上げ、実測と比べる。求人の構成(業種・職種の偏り)に左右されない比較になる。
  const companyEffects = new Map<string, CompanyEffect>();
  for (const [company, bucket] of byCompany) {
    let expectedClicksC = 0;
    let expectedAppliesC = 0;
    for (const r of bucket.rollups) {
      const bm = forJob(r.job);
      expectedClicksC += r.impressions * bm.ctr.center;
      expectedAppliesC += r.clicks * bm.applyRate.center;
    }
    const ctrRatio =
      expectedClicksC > 0
        ? clamp(
            shrink(bucket.clicks, bucket.impressions, 0.5, CTR_PRIOR_STRENGTH) /
              shrink(expectedClicksC, bucket.impressions, 0.5, CTR_PRIOR_STRENGTH),
            0.3,
            3
          )
        : 1;
    const applyRatio =
      expectedAppliesC > 0
        ? clamp(
            shrink(bucket.applies, bucket.clicks, 0.5, APPLY_PRIOR_STRENGTH) /
              shrink(expectedAppliesC, bucket.clicks, 0.5, APPLY_PRIOR_STRENGTH),
            0.3,
            3
          )
        : 1;
    companyEffects.set(company, {
      company,
      ctr: ctrRatio,
      applyRate: applyRatio,
      jobCount: bucket.rollups.length,
      impressions: bucket.impressions,
      clicks: bucket.clicks,
      applies: bucket.applies,
      confidence: shrinkConfidence(bucket.impressions, CTR_PRIOR_STRENGTH),
    });
  }

  const byIndustry = [...l1.entries()]
    .map(([industry, b]) => ({
      industry: industry as IndustryId,
      label: industryLabel(industry as IndustryId),
      jobCount: b.rollups.length,
      impressions: b.impressions,
      clicks: b.clicks,
      applies: b.applies,
      ctr: b.impressions > 0 ? b.clicks / b.impressions : 0,
      applyRate: b.clicks > 0 ? b.applies / b.clicks : 0,
      confidence: shrinkConfidence(b.impressions, CTR_PRIOR_STRENGTH),
    }))
    .sort((a, b) => b.impressions - a.impressions);

  return {
    forJob,
    companyEffect: (company) => {
      const e = companyEffects.get(company?.trim() ?? "");
      // 求人 2 件未満では企業の傾向とは言えない(その 1 件の特性でしかない)
      return e && e.jobCount >= 2 ? e : null;
    },
    companies: [...companyEffects.values()].sort(
      (a, b) => b.impressions - a.impressions
    ),
    rollup: (id) => rollupById.get(id),
    rollups,
    learning: {
      jobCount: rollups.length,
      snapshotCount: snapshots.length,
      impressions: all.impressions,
      clicks: all.clicks,
      applies: all.applies,
      overallConfidence: shrinkConfidence(all.impressions, CTR_PRIOR_STRENGTH),
      houseFactor: { ctr: houseCtr, applyRate: houseApply },
      byIndustry,
    },
  };
}

/** ベンチマークの粒度を日本語で説明する */
export const BENCHMARK_LEVEL_LABEL: Record<BenchmarkLevel, string> = {
  "job-category": "業種 × 職種 × 雇用形態",
  "industry-employment": "業種 × 雇用形態",
  industry: "業種",
  all: "登録済み全求人",
  seed: "暫定の初期値(実データ不足)",
};
