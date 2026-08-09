// 自社の他求人との比較。
//
// ベンチマークは「同セグメントの平均はこのくらい」という数字までしか教えてくれない。
// 運用の現場で本当に知りたいのは「うまくいっている求人は、この求人と何が違うのか」で、
// 同じ事務所が扱っている求人どうしなら、その差分を実際に突き合わせられる。
//
// 「上位2件はいずれも時給1,400円以上で、キャッチに休日条件が入っている。
//  この求人は1,350円・休日の記載なし」— ここまで言えると、提案は説得力を持つ。

import type { JobRollup } from "./benchmark";
import { normalizeCategory } from "./benchmark";
import { analyzeCatch, analyzeDescription } from "./copycheck";
import { percentile } from "./stats";
import type { FunnelStage, JobRecord } from "./types";

/** 比較に足る母数 */
const MIN_IMPRESSIONS = 1_000;
const MIN_CLICKS = 30;

export interface PeerJob {
  job: JobRecord;
  value: number;
  impressions: number;
}

export interface PeerComparison {
  /** 比較対象になった自社の他求人 */
  peers: PeerJob[];
  /** そのうち、この求人より成績が良いもの */
  better: PeerJob[];
  /** この求人がその中で何位か (1 始まり) */
  rank: number;
  total: number;
  /** 上位群との具体的な差分 */
  differences: string[];
  narrative: string | null;
}

function stageValue(r: JobRollup, stage: FunnelStage): number {
  if (stage === "apply") return r.clicks > 0 ? r.applies / r.clicks : 0;
  if (stage === "ctr") return r.impressions > 0 ? r.clicks / r.impressions : 0;
  return r.impressions / r.days;
}

function hasEnoughData(r: JobRollup, stage: FunnelStage): boolean {
  if (stage === "apply") return r.clicks >= MIN_CLICKS;
  return r.impressions >= MIN_IMPRESSIONS;
}

const yen = (n: number) => `${Math.round(n).toLocaleString()}円`;

/**
 * 上位群と対象求人の属性を突き合わせて、差分を日本語にする。
 * 「上位群の過半数がそうしていて、この求人はそうしていない」ものだけを挙げる。
 */
function findDifferences(job: JobRecord, better: PeerJob[]): string[] {
  const out: string[] = [];
  if (better.length === 0) return out;
  const half = better.length / 2;

  // --- 給与 ---
  const betterWages = better
    .map((p) => p.job.wage?.min)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const myWage = job.wage?.min;
  if (betterWages.length >= 2 && myWage) {
    const med = percentile(betterWages, 0.5);
    if (med > myWage * 1.03) {
      out.push(
        `成績が上の ${betterWages.length} 件は給与の中央値が ${yen(med)}。この求人は ${yen(myWage)} で、${Math.round((1 - myWage / med) * 100)}% 低い水準です`
      );
    }
  }

  // --- 給与の上限表記 ---
  const withRange = better.filter((p) => p.job.wage?.max).length;
  if (withRange > half && !job.wage?.max) {
    out.push(
      `成績が上の ${withRange} 件は給与を「〜円」の範囲で見せています。この求人は単一提示です`
    );
  }

  // --- スポンサー ---
  const sponsored = better.filter((p) => p.job.sponsored === true).length;
  if (sponsored > half && job.sponsored !== true) {
    out.push(
      `成績が上の ${sponsored} 件はスポンサー掲載です。この求人は${job.sponsored === false ? "無料掲載" : "掲載形態が未登録"}です`
    );
  }

  // --- 職場写真 ---
  const photos = better.filter((p) => p.job.hasPhotos === true).length;
  if (photos > half && job.hasPhotos !== true) {
    out.push(`成績が上の ${photos} 件は職場写真を載せています。この求人は未掲載です`);
  }

  // --- キャッチコピー ---
  const myCatch = job.copy?.catch ? analyzeCatch(job.copy.catch) : null;
  const betterCatches = better
    .map((p) => (p.job.copy?.catch ? analyzeCatch(p.job.copy.catch) : null))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (myCatch && betterCatches.length >= 2) {
    const withWage = betterCatches.filter((c) => c.hasWage).length;
    if (withWage > betterCatches.length / 2 && !myCatch.hasWage) {
      out.push(
        `成績が上の ${withWage} 件はキャッチコピーに給与を書いています。この求人は書いていません`
      );
    }
    const withSchedule = betterCatches.filter((c) => c.hasSchedule).length;
    if (withSchedule > betterCatches.length / 2 && !myCatch.hasSchedule) {
      out.push(
        `成績が上の ${withSchedule} 件はキャッチコピーに休日・勤務時間を書いています。この求人は書いていません`
      );
    }
    const medLen = percentile(betterCatches.map((c) => c.length), 0.5);
    if (medLen > myCatch.length + 12) {
      out.push(
        `成績が上の求人のキャッチコピーは中央値で全角 ${medLen.toFixed(0)} 文字。この求人は ${myCatch.length.toFixed(0)} 文字で、訴求枠を使い切れていません`
      );
    }
  }

  // --- 仕事内容の構成 ---
  const myDesc = job.copy?.description ? analyzeDescription(job.copy.description) : null;
  const betterDescs = better
    .map((p) => (p.job.copy?.description ? analyzeDescription(p.job.copy.description) : null))
    .filter((d): d is NonNullable<typeof d> => d !== null);
  if (myDesc && betterDescs.length >= 2) {
    const structured = betterDescs.filter((d) => d.headerCount >= 3).length;
    if (structured > betterDescs.length / 2 && myDesc.headerCount < 3) {
      out.push(
        `成績が上の ${structured} 件は仕事内容を◆◆3ブロック構成で書いています。この求人は見出しが ${myDesc.headerCount} 個です`
      );
    }
  }

  // --- 応募フォーム ---
  const myQ = job.friction?.questionCount;
  const betterQ = better
    .map((p) => p.job.friction?.questionCount)
    .filter((v): v is number => typeof v === "number");
  if (myQ !== undefined && betterQ.length >= 2) {
    const med = percentile(betterQ, 0.5);
    if (myQ > med + 1) {
      out.push(
        `成績が上の求人の応募フォームは中央値 ${med.toFixed(0)} 問。この求人は ${myQ} 問です`
      );
    }
  }

  return out.slice(0, 4);
}

/**
 * 対象求人と、同じセグメントの自社の他求人を比較する。
 * まず「業種 × 職種 × 雇用形態」で探し、2 件未満なら「業種 × 雇用形態」まで広げる。
 */
export function comparePeers(
  job: JobRecord,
  rollups: JobRollup[],
  stage: FunnelStage
): PeerComparison {
  const empty: PeerComparison = {
    peers: [],
    better: [],
    rank: 1,
    total: 1,
    differences: [],
    narrative: null,
  };

  const self = rollups.find((r) => r.job.id === job.id);
  if (!self || !hasEnoughData(self, stage)) return empty;

  const cat = normalizeCategory(job.jobCategory);
  const pick = (narrow: boolean) =>
    rollups.filter(
      (r) =>
        r.job.id !== job.id &&
        hasEnoughData(r, stage) &&
        r.job.industry === job.industry &&
        r.job.employmentType === job.employmentType &&
        (!narrow || normalizeCategory(r.job.jobCategory) === cat)
    );

  // まず同職種で探し、2 件に満たなければ同業種まで広げる
  let scope = pick(true);
  let scopeLabel = "同職種・同雇用形態";
  if (scope.length < 2) {
    scope = pick(false);
    scopeLabel = "同業種・同雇用形態";
  }
  if (scope.length < 2) return empty;

  const myValue = stageValue(self, stage);
  const peers: PeerJob[] = scope
    .map((r) => ({
      job: r.job,
      value: stageValue(r, stage),
      impressions: r.impressions,
    }))
    .sort((a, b) => b.value - a.value);

  const better = peers.filter((p) => p.value > myValue * 1.05);
  const rank = better.length + 1;
  const total = peers.length + 1;
  const differences = findDifferences(job, better);

  const stageWord =
    stage === "impressions" ? "表示数" : stage === "ctr" ? "クリック率" : "応募率";
  const fmt = (v: number) =>
    stage === "impressions" ? `${v.toFixed(0)}回/日` : `${(v * 100).toFixed(1)}%`;

  let narrative: string;
  if (better.length === 0) {
    narrative = `自社で登録している${scopeLabel}の求人 ${total} 件の中では、この求人の${stageWord}(${fmt(myValue)})が最も高い水準です。他社との比較では改善余地がありますが、社内に手本になる求人はありません。`;
  } else {
    const top = better[0];
    narrative =
      `自社で登録している${scopeLabel}の求人 ${total} 件中 ${rank} 位です(${stageWord} ${fmt(myValue)}、` +
      `最も高いのは「${top.job.name}」の ${fmt(top.value)})。`;
    if (differences.length > 0) {
      narrative += ` 上位の求人と突き合わせると、次の違いがあります。`;
    } else {
      narrative += ` 登録されている情報の範囲では、はっきりした違いは見つかりませんでした。上位求人の原稿を登録すると、どこが違うかまで比較できます。`;
    }
  }

  return { peers, better, rank, total, differences, narrative };
}
