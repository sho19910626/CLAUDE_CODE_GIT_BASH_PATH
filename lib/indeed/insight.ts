// 考察の生成 — 数値の診断結果を、人が読んで納得できる 1 つの話にまとめる。
//
// diagnose.ts が出すのは「CTR が基準比 31%」といった事実の羅列で、
// それ自体は正確でも「で、何が問題なの?」には答えていない。
// ここでは、ファネル 3 段階の組み合わせからその求人が置かれている「状態」を判定し、
//
//   どこが良くないか → なぜそうなっていると考えられるか → どうしたらいいか → どうなるか
//
// の順で短い文章にする。AI は使わない。同じ数字からは必ず同じ考察が出る。

import { jobHeadroom } from "./diagnose";
import { actionShort } from "./playbook";
import type { JobAnalysis } from "./recommend";
import type {
  FunnelStage,
  JobDiagnosis,
  JobRecord,
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

export interface Insight {
  pattern: InsightPattern;
  /** 一言でいうと */
  headline: string;
  /** どこが良くないか(数字つき) */
  problem: string;
  /** なぜそうなっていると考えられるか */
  reasoning: string;
  /** どうしたらいいか(最大 3 つ) */
  actions: string[];
  /** どうなるか */
  outlook: string;
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

export function buildInsight(
  job: JobRecord,
  diagnosis: JobDiagnosis,
  recommendations: Recommendation[]
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

  // --- どうなるか ---
  //
  // 大きく下回っている求人に「上位25%まで行けます」とだけ伝えるのは過大な期待になる。
  // まず「基準並みに戻す」を本線として示し、上位25%は上振れたときの数字として添える。
  // どちらも他の段階が今のままという前提の単純計算なので、そのことも明記する。
  const target = stage ? diagnosis.stages.find((s) => s.stage === stage) : null;
  const monthlyApplies = (m.applies * 30) / m.days;
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
    // 露出不足でクリック・応募がまだ評価できない場合、
    // ベンチマーク由来の率で応募数を試算しても数字が独り歩きするだけ
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
    problem,
    reasoning,
    actions.length > 0
      ? `やること: ${actions.map((a, i) => `${i + 1}) ${a}`).join(" / ")}`
      : "",
    outlook,
  ]
    .filter(Boolean)
    .join("\n");

  return { pattern, headline, problem, reasoning, actions, outlook, text };
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
