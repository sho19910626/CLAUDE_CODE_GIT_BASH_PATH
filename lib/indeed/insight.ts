// 考察の生成 — 数値の診断結果を、人が読んで納得できる 1 つの話にまとめる。
//
// diagnose.ts が出すのは「CTR が基準比 31%」といった事実の羅列で、
// それ自体は正確でも「で、何が問題なの?」には答えていない。
// ここでは、ファネル 3 段階の組み合わせからその求人が置かれている「状態」を判定し、
//
//   どこが良くないか → なぜそうなっていると考えられるか → どうしたらいいか → どうなるか
//
// の順で短い文章にする。AI は使わない。同じ数字からは必ず同じ考察が出る。

import type { CompanyEffect, JobRollup } from "./benchmark";
import { jobHeadroom } from "./diagnose";
import { buildJobTypeInsight, type JobTypeInsight } from "./jobtype";
import { comparePeers, type PeerComparison } from "./peers";
import { actionShort } from "./playbook";
import type { JobAnalysis } from "./recommend";
import { MONTH_NOTE } from "./season";
import { analyzeTrend, type TrendAnalysis } from "./trend";
import type {
  CostBreakdown,
  FunnelStage,
  Intervention,
  JobDiagnosis,
  JobRecord,
  MetricSnapshot,
  Recommendation,
  StageDiagnosis,
} from "./types";

/** 求人が置かれている状態のパターン */
export type InsightPattern =
  | "no-data" // 判断材料が足りない
  | "not-seen" // そもそも見られていない
  | "not-chosen" // 見られているが選ばれていない
  | "not-applied" // 開かれているが応募されていない
  | "double-weak" // 一覧でも詳細でも負けている
  | "healthy"; // 詰まりなし

/** 実行プランの 1 項目 */
export interface PlanItem {
  actionId: string;
  label: string;
  /** 単独で実施した場合の月間応募増 */
  gain: number;
  /** その求人での根拠 */
  evidence: string;
  unverified: boolean;
}

/** 実施の重さでまとめた実行プラン */
export interface PlanGroup {
  phase: string;
  note: string;
  items: PlanItem[];
}

export interface Insight {
  pattern: InsightPattern;
  /** 一言でいうと */
  headline: string;
  /** どこが良くないか(数字つき) */
  problem: string;
  /** なぜそうなっていると考えられるか */
  reasoning: string;
  /** 前期からどう変わったか。実績が 1 期間だけなら案内文 */
  trend: string | null;
  /** 自社の他求人と比べてどうか */
  comparison: string | null;
  /** 上位求人との具体的な差分 */
  differences: string[];
  /** 実施の重さでまとめた実行プラン */
  plan: PlanGroup[];
  /** どうしたらいいか(最大 3 つ・短い言い方) */
  actions: string[];
  /** どうなるか */
  outlook: string;
  /** プラン全体をやりきった場合の見込み */
  combined: string | null;
  /** この段階を直したあと、次に効いてくる段階 */
  nextStep: string | null;
  /** 時期を踏まえた動き方の助言 */
  timing: string | null;
  /** 職種・雇用形態ならではの考察 */
  jobType: { label: string | null; text: string } | null;
  /** 企業ごとの傾向(蓄積データから学習したもの) */
  company: string | null;
  /** お金の見立て。応募単価の内訳と、予算を使い切っているか */
  money: string | null;
  /** そのままコピーして使える通しの文章 */
  text: string;
}

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const ratio = (v: number) => `${Math.round(v * 100)}%`;
const n = (v: number) => Math.round(v).toLocaleString();

/** その段階の実測値と基準値を「Xで、基準Yの Z%」の形にする */
function gap(s: StageDiagnosis): string {
  const fmt = (v: number) =>
    s.stage === "impressions" ? `${v.toFixed(0)}回` : pct(v);
  return `${fmt(s.value)}(基準 ${fmt(s.benchmark)} の ${ratio(s.ratio)})`;
}

/**
 * 提案から短い行動を取り出す。
 * 考察の本文で名指しした施策(lead)は、必ず先頭に置く。
 * 本文で「まず給与を確認してください」と言いながら、やることの1番目が
 * 別の施策になっていると、読んだ人が何をすればいいか分からなくなるため。
 */
function pickActions(
  recs: Recommendation[],
  stage: FunnelStage | null,
  lead?: string,
  max = 3
): string[] {
  const leadRec = lead ? recs.find((r) => r.actionId === lead) : undefined;
  const remaining = recs.filter((r) => r !== leadRec);
  const primary = stage ? remaining.filter((r) => r.stage === stage) : [];
  const rest = remaining.filter((r) => !primary.includes(r));
  return [...(leadRec ? [leadRec] : []), ...primary, ...rest]
    .slice(0, max)
    .map((r) => actionShort(r.actionId));
}

/** 提案の根拠のうち、原稿が確認できているものだけを 1 つ借りる */
function firstEvidence(
  recs: Recommendation[],
  stage: FunnelStage
): Recommendation | null {
  return recs.find((x) => x.stage === stage && !x.unverified) ?? null;
}

/** 考察を厚くするための追加情報。無くても考察は成立する */
export interface InsightContext {
  snapshots?: MetricSnapshot[];
  interventions?: Intervention[];
  /** 自社の他求人(比較用) */
  rollups?: JobRollup[];
  /** 季節指数のカーブ。推移の季節調整に使う */
  seasonCurve?: number[];
  /** 企業ごとの傾向。蓄積データから学習したもの */
  companyEffect?: CompanyEffect | null;
  /** 応募単価の内訳。費用が入っているときだけ */
  cost?: CostBreakdown;
  /** 日予算を使い切っているか */
  budget?: { capped: boolean; dailyCost?: number; days: number };
}


/**
 * お金の見立てを文章にする。
 *
 * 応募単価 = クリック単価 ÷ 応募率 なので、単価が高いときは
 * 「クリックが高い」か「応募率が低い」かのどちらか(または両方)。
 * この 2 つは打ち手がまったく違う。
 *   クリックが高い → 入札・キーワード・競合(管理画面の話)
 *   応募率が低い   → 原稿と応募フロー(原稿の話)
 * 取り違えると、原稿をいくら直しても単価は下がらない。
 *
 * 「片方だけ直したらいくらになるか」を並べて、どちらが効くかを数字で見せる。
 */
function buildMoneyNote(
  cost: CostBreakdown | undefined,
  budget: { capped: boolean; dailyCost?: number; days: number } | undefined,
  metrics: JobDiagnosis["metrics"]
): string | null {
  const parts: string[] = [];

  if (cost && Number.isFinite(cost.cpa)) {
    const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;
    const head =
      `応募単価は ${yen(cost.cpa)}(クリック単価 ${yen(cost.cpc)} ÷ 応募率 ${(
        cost.applyRate * 100
      ).toFixed(1)}%)。`;

    if (cost.driver === "none") {
      parts.push(
        head +
          (cost.benchmarkCpc !== undefined
            ? `クリック単価も応募率も、自社の他求人と比べて極端ではありません。単価を下げたい場合は、まず応募数そのものを増やすほうが効きます。`
            : `比較できる求人がまだ少ないため、高い安いの判断は保留です。`)
      );
    } else if (cost.driver === "cpc") {
      parts.push(
        head +
          `高い原因はクリック単価です(自社の相場 ${yen(cost.benchmarkCpc!)} に対して ${(
            cost.cpc / cost.benchmarkCpc!
          ).toFixed(1)}倍)。` +
          (cost.cpaIfCpcFixed !== undefined
            ? `入札を相場まで戻せば、応募単価は ${yen(cost.cpaIfCpcFixed)} まで下がる計算です。`
            : "") +
          `原稿ではなく、入札額・キーワード・競合の見直しが先です。`
      );
    } else if (cost.driver === "applyRate") {
      parts.push(
        head +
          `高い原因は応募率の低さです。クリック単価は相場どおりなので、入札をいじっても単価は下がりません。` +
          (cost.cpaIfApplyRateFixed !== undefined
            ? `応募率を基準並みに戻せば、応募単価は ${yen(cost.cpaIfApplyRateFixed)} まで下がります。`
            : "") +
          `原稿(給与の見せ方・仕事内容・応募のしやすさ)を直すほうが効きます。`
      );
    } else {
      parts.push(
        head +
          `クリック単価が相場より高く、かつ応募率も低い状態です。` +
          (cost.cpaIfCpcFixed !== undefined && cost.cpaIfApplyRateFixed !== undefined
            ? `入札だけ直すと ${yen(cost.cpaIfCpcFixed)}、原稿だけ直すと ${yen(
                cost.cpaIfApplyRateFixed
              )}。効きが大きいほうから着手してください。`
            : "") +
          `両方直せば単価は大きく下がりますが、まず原稿を直してから入札を調整するほうが、無駄打ちが減ります。`
      );
    }
  }

  if (budget?.capped && budget.dailyCost !== undefined) {
    parts.push(
      `日ごとの消化額が ${budget.dailyCost.toLocaleString("ja-JP")}円 前後でそろっています(${budget.days}日ぶん)。` +
        `日予算の上限に張り付いている可能性が高い状態です。表示数が伸びない原因は原稿ではなく予算なので、` +
        `原稿を直すより先に、日予算を上げるかクライアントに増額を提案するほうが応募は増えます。`
    );
  } else if (
    metrics.costPerDay !== undefined &&
    budget &&
    budget.days >= 5 &&
    !budget.capped
  ) {
    parts.push(
      `日ごとの消化額は ${Math.round(metrics.costPerDay).toLocaleString("ja-JP")}円 前後で、日によってばらついています。` +
        `予算を使い切ってはいないので、表示数が足りない場合の原因は予算ではなく入札額かキーワードの側です。`
    );
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

export function buildInsight(
  job: JobRecord,
  diagnosis: JobDiagnosis,
  recommendations: Recommendation[],
  context: InsightContext = {}
): Insight {
  const [imp, ctr, apply] = diagnosis.stages;
  const m = diagnosis.metrics;
  const seg = diagnosis.benchmark.label;

  const impWeak = imp.verdict === "weak";
  const ctrWeak = ctr.verdict === "weak";
  const applyWeak = apply.verdict === "weak";
  const ctrUnknown = ctr.verdict === "insufficient";
  const applyUnknown = apply.verdict === "insufficient";

  let pattern: InsightPattern;
  if (ctrUnknown && applyUnknown && !impWeak) pattern = "no-data";
  else if (impWeak) pattern = "not-seen";
  else if (ctrWeak && applyWeak) pattern = "double-weak";
  else if (ctrWeak) pattern = "not-chosen";
  else if (applyWeak) pattern = "not-applied";
  else if (ctrUnknown && applyUnknown) pattern = "no-data";
  else pattern = "healthy";

  let headline = "";
  let problem = "";
  let reasoning = "";
  let stage: FunnelStage | null = diagnosis.bottleneck;
  /** 本文で名指しした施策。やることの先頭に固定する */
  let lead: string | undefined;

  switch (pattern) {
    case "not-seen": {
      stage = "impressions";
      headline = "そもそも求職者の目に触れていません";
      problem = `1日あたりの表示が ${gap(imp)}。${m.days}日で ${n(m.impressions)} 回しか出ていません。`;
      if (job.sponsored === false) {
        reasoning =
          "無料掲載のままなので、時間が経つほど新着求人に押し出されて検索結果の下に沈みます。原稿の良し悪し以前に、見られる量そのものが足りていません。";
        lead = "imp-sponsor-start";
      } else if (job.sponsored === true) {
        reasoning =
          "スポンサー掲載でこの表示数ということは、日予算が早い時間に尽きているか、タイトルの職種名・勤務地が求職者の検索語と噛み合っていないかのどちらかです。";
        lead = "imp-budget-up";
      } else {
        reasoning =
          "掲載形態が未登録なので断定はできませんが、この表示数だと「無料掲載のまま沈んでいる」か「スポンサーの日予算が早い時間に尽きている」かのどちらかです。求人を編集して掲載形態を登録すると、どちらなのかまで判定できます。";
      }
      if (ctr.verdict === "good" || apply.verdict === "good") {
        reasoning +=
          " 一方でクリック率・応募率は基準以上なので、原稿は機能しています。見られる量さえ増えれば、応募はそのまま比例して増えます。ここが一番おいしい状態です。";
      } else if (ctrWeak || applyWeak) {
        reasoning +=
          " ただし露出を増やしても、クリック率・応募率が基準割れのままだと費用だけが増えます。表示を伸ばすのと並行して原稿も直してください。";
      }
      break;
    }

    case "not-chosen": {
      stage = "ctr";
      headline = "一覧には出ているのに、選ばれていません";
      problem = `クリック率が ${gap(ctr)}。${n(m.impressions)} 回表示されて、クリックは ${n(m.clicks)} 回だけです。`;
      reasoning =
        "求職者が検索結果の一覧で見ているのは、タイトル・給与・勤務地・キャッチコピーの4つだけです。詳細を開くかどうかはここで決まるので、この4つのどれかが並んでいる他社に負けているということになります。";
      const ev = firstEvidence(recommendations, "ctr");
      if (ev) {
        reasoning += ` 実際に確認できた範囲では、${ev.evidence}`;
        lead = ev.actionId;
      }
      if (apply.verdict === "good") {
        reasoning +=
          " 詳細まで来た人の応募率は基準以上なので、中身は悪くありません。入口の見せ方だけの問題です。";
      }
      break;
    }

    case "not-applied": {
      stage = "apply";
      headline = "詳細まで来ているのに、応募で止まっています";
      problem = `応募率が ${gap(apply)}。${n(m.clicks)} 回クリックされて、応募は ${n(m.applies)} 件です。`;
      reasoning =
        ctr.verdict === "good"
          ? "クリック率は基準以上なので、一覧での見せ方は成功しています。つまり、期待して開いた人が中身を見て離れている状態です。一覧で見せた条件が詳細で確認できないか、仕事の中身が具体的に書かれていないかのどちらかが原因です。"
          : "求人詳細はスマホで斜め読みされます。仕事の中身・条件・応募後の流れのどれかが読み取れないまま、判断を保留して閉じられています。";
      const ev = firstEvidence(recommendations, "apply");
      if (ev) {
        reasoning += ` 実際に確認できた範囲では、${ev.evidence}`;
        lead = ev.actionId;
      }
      // 上の根拠がすでに応募フォームの話なら、同じことを繰り返さない
      if (
        job.friction?.questionCount &&
        job.friction.questionCount > 3 &&
        ev?.actionId !== "apply-form-friction"
      ) {
        reasoning += ` あわせて、応募フォームの設問が ${job.friction.questionCount} 問あるのも最後の離脱を生んでいます。`;
      }
      break;
    }

    case "double-weak": {
      stage = diagnosis.bottleneck ?? "ctr";
      headline = "一覧でも詳細でも、他社に負けています";
      problem = `クリック率 ${gap(ctr)}、応募率 ${gap(apply)}。2段階とも基準を下回っています。`;
      reasoning =
        "2段階同時に落ちているときは、原稿の細部より条件そのものが競合に見劣りしている可能性が高いです。一覧で選ばれず、開いても応募されないのは、給与・休日・勤務時間のどれかが同じエリアの同職種の水準に届いていないときの典型的な出方です。";
      const wageEv = recommendations.find(
        (r) => r.actionId === "ctr-wage-below-market"
      );
      if (wageEv) {
        reasoning += ` 実際、${wageEv.evidence} まずここを動かせるか確認してください。`;
        lead = wageEv.actionId;
      } else {
        reasoning +=
          " 条件を動かせない場合は、通勤のしやすさ・シフトの融通・職場環境など、給与以外の魅力を前面に出す方向に切り替える必要があります。";
      }
      break;
    }

    case "healthy": {
      const roomToGrow = imp.verdict !== "good";
      // 原稿は効いているが露出が伸びていない求人に「詰まりなし」とだけ言うと、
      // 打ち手がある状態を放置させてしまう
      headline = roomToGrow
        ? "原稿は効いています。あとは露出を増やすだけです"
        : "詰まっているところはありません";
      problem = `クリック率 ${pct(m.ctr)}、応募率 ${pct(m.applyRate)} とも基準を下回っておらず、${m.days}日で ${n(m.applies)} 件の応募が取れています。`;
      reasoning = roomToGrow
        ? `一方で1日あたりの表示は ${gap(imp)} にとどまっています。クリックされた人はきちんと応募しているので、文言をこれ以上直しても応募は大きく増えません。見られる回数を増やすのが最短です。`
        : "3段階とも基準以上です。この求人は原稿を触るより、掲載を維持しながら他の求人に手をかけたほうが全体の応募は増えます。";
      stage = roomToGrow ? "impressions" : null;
      if (roomToGrow && job.sponsored !== undefined) {
        lead = job.sponsored === false ? "imp-sponsor-start" : "imp-budget-up";
      }
      break;
    }

    default: {
      headline = "まだ判断できません";
      problem = `${m.days}日で 表示 ${n(m.impressions)} 回・クリック ${n(m.clicks)} 回・応募 ${n(m.applies)} 件。判定に必要な母数に届いていません。`;
      reasoning =
        "この段階で「クリック率が低い」と決めつけると、ただのブレを課題として扱うことになります。クリック率は表示300回以上、応募率はクリック30件以上たまってから判定します。" +
        (imp.verdict === "weak"
          ? " ただし表示数そのものが基準を大きく下回っているので、まず露出を増やさないとデータも貯まりません。"
          : " もう1期間ぶん実績を登録してください。");
      stage = imp.verdict === "weak" ? "impressions" : null;
      break;
    }
  }

  const actions = pickActions(recommendations, stage, lead);
  const monthlyApplies = (m.applies * 30) / m.days;

  // 診断は登録済みの実績をすべて合計して行う(母数が多いほど判定が安定するため)。
  // ただし複数期間をまとめた数字だと明示しないと、下の「推移」に出る直近の値と
  // 食い違って見えるので、集計範囲を必ず添える。
  const periodNote = describePeriod(context.snapshots, m.days);
  if (periodNote) problem = `${problem}(${periodNote})`;

  // ===== 推移(前期比) =====
  const trendAnalysis: TrendAnalysis | null = context.snapshots
    ? analyzeTrend(
        context.snapshots,
        context.interventions ?? [],
        context.seasonCurve
      )
    : null;

  // ===== 自社の他求人との比較 =====
  const peer: PeerComparison | null =
    context.rollups && stage
      ? comparePeers(job, context.rollups, stage)
      : null;

  // ===== 実行プラン(実施の重さでまとめる) =====
  const plan = buildPlan(recommendations);

  // ===== 全部やりきった場合の見込み =====
  const combined = estimateCombined(diagnosis, recommendations, monthlyApplies);

  // ===== 次に効いてくる段階 =====
  const nextStep = findNextStep(diagnosis, stage);

  // ===== 時期を踏まえた動き方 =====
  const timing = buildTiming(diagnosis, context.snapshots);

  // ===== 職種・雇用形態ならではの考察 =====
  const jt: JobTypeInsight | null = buildJobTypeInsight(job, stage);
  const jobType = jt && jt.text ? { label: jt.label, text: jt.text } : null;

  // ===== 企業ごとの傾向 =====
  const company = buildCompanyNote(job, context.companyEffect ?? null, stage);

  // --- お金の見立て ---
  const money = buildMoneyNote(context.cost, context.budget, m);

  // --- どうなるか ---
  //
  // 大きく下回っている求人に「上位25%まで行けます」とだけ伝えるのは過大な期待になる。
  // まず「基準並みに戻す」を本線として示し、上位25%は上振れたときの数字として添える。
  // どちらも他の段階が今のままという前提の単純計算なので、そのことも明記する。
  const target = stage ? diagnosis.stages.find((s) => s.stage === stage) : null;
  const stageWord =
    stage === "impressions"
      ? "表示数"
      : stage === "ctr"
        ? "クリック率"
        : "応募率";

  let outlook: string;
  if (pattern === "double-weak") {
    // 2段階とも落ちているときは、片方だけ直した数字を出しても意味がない。
    // 両方を基準並みに戻した場合の応募数を、率から直接組み立てる(割り算を挟まないので 0 件でも壊れない)
    const projected =
      m.impressionsPerDay *
      30 *
      Math.max(m.ctr, ctr.benchmark) *
      Math.max(m.applyRate, apply.benchmark);
    outlook =
      `クリック率と応募率の両方を基準並みに戻せれば、月の応募は今の約 ${monthlyApplies.toFixed(1)} 件から ${projected.toFixed(1)} 件前後まで戻る計算です(2段階の改善は掛け算で効きます)。` +
      `ただし条件そのものが原因の場合、原稿だけでここまで戻すのは難しいので、給与・休日の見直しとセットで考えてください。`;
  } else if (pattern === "no-data") {
    outlook =
      "この状態では見込みの試算もあてになりません。次の実績を登録した時点であらためて判定します。";
  } else if (ctrUnknown && applyUnknown) {
    outlook =
      "クリック率・応募率がまだ評価できる母数に達していないため、応募増の試算は出しません。まず露出を増やして、判定できるだけのデータを貯めてください。";
  } else if (target && target.realisticGain >= 0.5) {
    outlook =
      `${stageWord}を同じ${seg}の基準並みまで戻せれば、月の応募は今の約 ${monthlyApplies.toFixed(1)} 件から ${(monthlyApplies + target.realisticGain).toFixed(1)} 件前後。` +
      `上位25%の水準まで持っていければ ${(monthlyApplies + target.potentialGain).toFixed(1)} 件前後です` +
      `(他の段階が今のままという前提の単純計算です)。`;
  } else if (target && target.potentialGain >= 0.5) {
    outlook =
      `${stageWord}はすでに基準並みです。上位25%の水準まで伸ばせれば、月の応募は約 ${monthlyApplies.toFixed(1)} 件から ${(monthlyApplies + target.potentialGain).toFixed(1)} 件前後になる見込みです` +
      `(他の段階が今のままという前提の単純計算です)。`;
  } else if (pattern === "healthy") {
    outlook = `現状のまま月 ${monthlyApplies.toFixed(1)} 件前後で推移します。応募を増やしたい場合は予算を足してください。`;
  } else {
    outlook = `改善による上積みは月 ${(target?.potentialGain ?? 0).toFixed(1)} 件程度の見込みで、大きくは動きません。手をかける優先度は低めです。`;
  }

  const text = [
    `【${headline}】`,
    "",
    `■ 現状`,
    problem,
    trendAnalysis?.narrative ? `\n■ 推移\n${trendAnalysis.narrative}` : "",
    peer?.narrative
      ? `\n■ 自社の他求人との比較\n${peer.narrative}` +
        (peer.differences.length > 0
          ? "\n" + peer.differences.map((d) => `・${d}`).join("\n")
          : "")
      : "",
    `\n■ 原因の見立て`,
    reasoning,
    jobType ? `\n■ この職種ならではの見立て\n${jobType.text}` : "",
    company ? `\n■ この企業の傾向(蓄積データから)\n${company}` : "",
    money ? `\n■ お金の見立て\n${money}` : "",
    plan.length > 0
      ? "\n■ やること\n" +
        plan
          .map(
            (g) =>
              `【${g.phase}】${g.note}\n` +
              g.items
                .map((it) => `  ・${it.label}(月+${it.gain.toFixed(1)}件)`)
                .join("\n")
          )
          .join("\n")
      : "",
    timing ? `\n■ 時期について\n${timing}` : "",
    `\n■ 見込み`,
    outlook,
    combined ?? "",
    nextStep ?? "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return {
    pattern,
    headline,
    problem,
    reasoning,
    trend: trendAnalysis?.narrative ?? null,
    comparison: peer?.narrative ?? null,
    differences: peer?.differences ?? [],
    plan,
    actions,
    outlook,
    combined,
    nextStep,
    timing,
    jobType,
    company,
    money,
    text,
  };
}

/**
 * 時期を踏まえた動き方の助言。
 *
 * 「今が動かない時期かどうか」だけでなく、「次に何が来るか」まで言う。
 * 12月に「応募が少ないですね」と報告するだけでは何の役にも立たないが、
 * 「1月から急増するので年内に原稿を整えておきましょう」なら手が打てる。
 */
function buildTiming(
  diagnosis: JobDiagnosis,
  snapshots: MetricSnapshot[] | undefined
): string | null {
  const { index, label } = diagnosis.season;
  if (!label && !snapshots?.length) return null;

  // 直近の実績が終わった月の翌月を「これから」とみなす
  const ends = (snapshots ?? []).map((s) => s.periodEnd).sort();
  const lastEnd = ends[ends.length - 1];
  const month = lastEnd ? Number(lastEnd.slice(5, 7)) : null;
  const nextMonth = month ? (month % 12) + 1 : null;

  const parts: string[] = [];

  if (label) {
    parts.push(
      `この期間は${label}です(季節指数 ${index.toFixed(2)}、平年 = 1.00)。` +
        `診断のベンチマークはこの時期に合わせて補正済みなので、上の判定は季節を差し引いたうえでの評価です。`
    );
  }

  if (index <= 0.9) {
    parts.push(
      "応募が少ないこと自体は時期の問題なので、慌てて条件を下げる判断は避けてください。" +
        "一方で他社も掲載を控える時期なので、出し続けていれば埋もれにくいという利点はあります。"
    );
  } else if (index >= 1.15) {
    parts.push(
      "求職者が動く時期なので、ここで取り切れないと年間の採用計画に響きます。" +
        "競合の求人も増えて埋もれやすいため、この時期こそ予算と原稿を優先的に投じる価値があります。"
    );
  }

  if (nextMonth && MONTH_NOTE[nextMonth]) {
    parts.push(`次の月について: ${MONTH_NOTE[nextMonth]}。`);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

/** 「5/1〜7/31 の3期間・92日間の合計」のような但し書きを作る */
function describePeriod(
  snapshots: MetricSnapshot[] | undefined,
  days: number
): string | null {
  if (!snapshots || snapshots.length === 0) return null;
  const starts = snapshots.map((s) => s.periodStart).sort();
  const ends = snapshots.map((s) => s.periodEnd).sort();
  const short = (iso: string) => {
    const m = iso.match(/^\d{4}-(\d{2})-(\d{2})/);
    return m ? `${Number(m[1])}/${Number(m[2])}` : iso;
  };
  const range = `${short(starts[0])}〜${short(ends[ends.length - 1])}`;
  return snapshots.length === 1
    ? `${range}・${days}日間`
    : `${range}・${snapshots.length}期間 ${days}日間の合計`;
}

/**
 * 企業ごとの傾向を文にする。
 *
 * 「この企業の求人は、同じ職種の基準に対していつも 2 割クリックされにくい」と分かると、
 * 個々の求人の数字の読み方が変わる。原稿の問題ではなく企業側の要因(知名度・条件・
 * 職場環境)である可能性が高く、打ち手の相談相手も変わるため。
 */
function buildCompanyNote(
  job: JobRecord,
  effect: CompanyEffect | null,
  stage: FunnelStage | null
): string | null {
  if (!effect || effect.jobCount < 2) return null;

  const pctOf = (v: number) =>
    v >= 1 ? `${Math.round((v - 1) * 100)}% 上` : `${Math.round((1 - v) * 100)}% 下`;
  const notable = (v: number) => Math.abs(v - 1) >= 0.1;

  const parts: string[] = [
    `${job.company} の求人は ${effect.jobCount} 件・累計 ${effect.impressions.toLocaleString()} 表示ぶんのデータが貯まっています。`,
  ];

  const ctrNotable = notable(effect.ctr);
  const applyNotable = notable(effect.applyRate);

  if (!ctrNotable && !applyNotable) {
    parts.push(
      "同じ職種・雇用形態の基準と比べて、この企業に特有の上振れ・下振れは見られません。今回の数字はこの求人固有の要因で説明できます。"
    );
    return parts.join(" ");
  }

  const traits: string[] = [];
  if (ctrNotable) traits.push(`クリック率が基準より ${pctOf(effect.ctr)}`);
  if (applyNotable) traits.push(`応募率が基準より ${pctOf(effect.applyRate)}`);
  parts.push(
    `同じ職種・雇用形態の基準と比べると、この企業の求人は一貫して ${traits.join("、")} に出ています。`
  );

  // 下振れしている段階が、いま詰まっている段階と一致するかで意味が変わる
  const downAtStage =
    (stage === "ctr" && effect.ctr < 0.9) ||
    (stage === "apply" && effect.applyRate < 0.9);
  const upAtStage =
    (stage === "ctr" && effect.ctr > 1.1) ||
    (stage === "apply" && effect.applyRate > 1.1);

  if (downAtStage) {
    parts.push(
      "いま詰まっている段階と同じ方向なので、この求人だけの問題ではなく企業側の要因(知名度・条件水準・職場環境)が効いている可能性が高いです。" +
        "原稿の微調整で取り返せる幅は限られるため、条件そのものの見直しをクライアントに提案するほうが早い場面です。"
    );
  } else if (upAtStage) {
    parts.push(
      "この企業は本来その段階が強いので、今回の落ち込みはこの求人固有の要因です。同じ企業の他の求人と原稿・条件を突き合わせると、違いがすぐ見つかるはずです。"
    );
  } else {
    parts.push(
      "いま詰まっている段階とは別の指標なので、今回の課題とは切り分けて考えてください。"
    );
  }

  if (effect.confidence < 0.3) {
    parts.push(
      `ただしこの傾向は実データ反映度 ${(effect.confidence * 100).toFixed(0)}% とまだ薄く、参考程度です。同じ企業の実績が貯まるほど確かになります。`
    );
  }

  return parts.join(" ");
}

// ===== 実行プラン =====

const PHASES: { effort: 1 | 2 | 3; phase: string; note: string }[] = [
  { effort: 1, phase: "今すぐできる", note: "管理画面の設定変更だけで終わります" },
  { effort: 2, phase: "今週中に", note: "原稿の書き換えが必要です" },
  { effort: 3, phase: "クライアントに相談", note: "条件そのものの見直しが必要です" },
];

function buildPlan(recs: Recommendation[]): PlanGroup[] {
  return PHASES.map(({ effort, phase, note }) => ({
    phase,
    note,
    items: recs
      .filter((r) => r.effort === effort)
      // 提案全体の並びは段階の判定による重みも掛かっているため、
      // プランの中では純粋に効果の大きい順に並べ直す
      .sort((a, b) => b.expectedGain - a.expectedGain)
      .slice(0, 4)
      .map((r) => ({
        actionId: r.actionId,
        label: actionShort(r.actionId),
        gain: r.expectedGain,
        evidence: r.evidence,
        unverified: r.unverified,
      })),
  })).filter((g) => g.items.length > 0);
}

/**
 * プランをやりきった場合の見込み。
 *
 * 同じ段階の施策は効果が重なるので足し算しない(その段階で最も効果の大きい 1 つを採る)。
 * 段階をまたぐ改善は掛け算で効くので、そこだけ掛け合わせる。
 * どの段階も上位25%の水準で頭打ちにして、過大な数字が出ないようにしている。
 */
function estimateCombined(
  diagnosis: JobDiagnosis,
  recs: Recommendation[],
  monthlyApplies: number
): string | null {
  if (recs.length === 0 || monthlyApplies <= 0) return null;

  let multiplier = 1;
  let stagesUsed = 0;
  for (const s of diagnosis.stages) {
    if (s.verdict === "insufficient") continue;
    const best = recs
      .filter((r) => r.stage === s.stage)
      .sort((a, b) => b.expectedLift - a.expectedLift)[0];
    if (!best) continue;
    // その段階の伸びしろ(上位25%まで)を超えるリフトは見込まない
    const ceiling = s.value > 0 ? s.target / s.value : 1 + best.expectedLift;
    multiplier *= Math.min(1 + best.expectedLift, Math.max(1, ceiling));
    stagesUsed++;
  }

  const projected = monthlyApplies * multiplier;
  if (stagesUsed === 0 || projected < monthlyApplies * 1.05) return null;

  return (
    `プランを一通りやりきった場合の見込みは、月の応募 約 ${monthlyApplies.toFixed(1)} 件 → ${projected.toFixed(1)} 件前後です` +
    `(同じ段階の施策は効果が重なるため足し算せず、最も効くもの 1 つで見積もっています)。`
  );
}

/** 今のボトルネックを直したあと、次に効いてくる段階 */
function findNextStep(
  diagnosis: JobDiagnosis,
  current: FunnelStage | null
): string | null {
  const next = diagnosis.stages
    .filter((s) => s.stage !== current && s.verdict !== "insufficient")
    .filter((s) => s.realisticGain >= 0.5)
    .sort((a, b) => b.realisticGain - a.realisticGain)[0];
  if (!next) return null;

  const word =
    next.stage === "impressions"
      ? "表示数"
      : next.stage === "ctr"
        ? "クリック率"
        : "応募率";
  const fmt = (v: number) =>
    next.stage === "impressions" ? `${v.toFixed(0)}回/日` : `${(v * 100).toFixed(1)}%`;

  return (
    `そのあとは【${word}】が次のボトルネックになります` +
    `(現在 ${fmt(next.value)}、基準 ${fmt(next.benchmark)})。ここも直すとさらに月 +${next.realisticGain.toFixed(1)} 件の余地があります。`
  );
}

// ===== 全求人まとめての考察 =====

export const PATTERN_LABEL: Record<InsightPattern, string> = {
  "not-seen": "見られていない(露出不足)",
  "not-chosen": "選ばれていない(一覧での見せ方)",
  "not-applied": "応募されていない(詳細の中身)",
  "double-weak": "条件で負けている",
  healthy: "詰まりなし",
  "no-data": "判定待ち",
};

export interface PortfolioInsight {
  headline: string;
  body: string;
  /** パターンごとの内訳 */
  breakdown: {
    pattern: InsightPattern;
    label: string;
    count: number;
    gain: number;
  }[];
}

/**
 * 求人をまとめて見たときの考察。
 * 運用代行だと 1 件ずつ見るより「どのタイプが何件あるか」で動いたほうが早いので、
 * 同じ原因で詰まっている求人をまとめて示す。
 */
export function buildPortfolioInsight(jobs: JobAnalysis[]): PortfolioInsight {
  if (jobs.length === 0) {
    return {
      headline: "まだ求人が登録されていません",
      body: "実績を取り込むと、ここに全体の考察が出ます。",
      breakdown: [],
    };
  }

  const counts = new Map<InsightPattern, { count: number; gain: number }>();
  for (const j of jobs) {
    const ins = buildInsight(j.job, j.diagnosis, j.recommendations);
    const cur = counts.get(ins.pattern) ?? { count: 0, gain: 0 };
    counts.set(ins.pattern, {
      count: cur.count + 1,
      gain: cur.gain + jobHeadroom(j.diagnosis),
    });
  }

  const ORDER: InsightPattern[] = [
    "not-seen",
    "double-weak",
    "not-chosen",
    "not-applied",
    "healthy",
    "no-data",
  ];
  const breakdown = ORDER.filter((p) => counts.has(p)).map((p) => ({
    pattern: p,
    label: PATTERN_LABEL[p],
    count: counts.get(p)!.count,
    gain: counts.get(p)!.gain,
  }));

  // 応募を増やす余地が最大のタイプを「まず手を付けるべき塊」として示す
  const actionable = breakdown.filter(
    (b) => b.pattern !== "healthy" && b.pattern !== "no-data"
  );
  const top = [...actionable].sort((a, b) => b.gain - a.gain)[0];

  const list = breakdown.map((b) => `${b.label} ${b.count}件`).join(" / ");
  const multiple = top && top.count > 1;

  const headline = !top
    ? `${jobs.length}件とも、明確な詰まりはありません`
    : multiple
      ? `${jobs.length}件のうち ${top.count}件が「${top.label}」— ここが最大の塊です`
      : `まず手を付けるべきは「${top.label}」の1件です`;

  const body = !top
    ? `内訳は ${list}。原稿を直すより、予算を足して表示を伸ばすほうが応募は増える局面です。`
    : `内訳は ${list}。` +
      (multiple
        ? `同じ原因で詰まっている求人はまとめて直したほうが速いので、まず「${top.label}」の ${top.count}件から着手してください。`
        : "応募の増え方が一番大きいのがこの求人です。") +
      (top.gain >= 1
        ? `基準並みまで戻せれば、月 +${top.gain.toFixed(0)}件ぶんの応募が見込めます。`
        : "");

  return { headline, body, breakdown };
}
