// 推移の分析 — 「今どうか」だけでなく「どう変わってきたか」を見る。
//
// ベンチマーク比較(diagnose.ts)は他社との横の比較。こちらは自分自身との縦の比較。
// 同じ「CTR 2.7%」でも、先月 3.4% から落ちてきたのか、2.1% から戻してきたのかで
// 打つべき手はまったく変わる。落ちているなら原因の特定が先で、
// 戻してきているなら今やっていることを続けるのが正解になる。
//
// 変化の直前に記録された施策があれば突き合わせて、
// 「その変化はこの施策の後に起きている」と示す。

import {
  MONTH_NOTE,
  dominantMonth,
  periodSeasonIndex,
  seasonFactor,
  type SeasonMetric,
} from "./season";
import { dayCount, proportionsDiffer, rate, relativeLift } from "./stats";
import type { Intervention, MetricSnapshot } from "./types";

/** 期間 1 つぶんの実績 */
export interface TrendPoint {
  periodStart: string;
  periodEnd: string;
  days: number;
  impressions: number;
  clicks: number;
  applies: number;
  ctr: number;
  applyRate: number;
  impressionsPerDay: number;
  appliesPerMonth: number;
}

export type TrendDirection = "up" | "down" | "flat";

export interface MetricChange {
  metric: "impressions" | "ctr" | "apply";
  label: string;
  before: number;
  after: number;
  /** 見かけの相対変化率。-0.21 なら 21% 低下 */
  lift: number;
  /** 季節要因を取り除いた実質の変化率 */
  adjustedLift: number;
  /** 季節要因だけで説明できる変化率(期待される増減) */
  expectedBySeason: number;
  /** 判定は季節調整後の値で行う */
  direction: TrendDirection;
  /** 統計的に差があると言えるか */
  significant: boolean;
}

export interface TrendAnalysis {
  points: TrendPoint[];
  latest: TrendPoint | null;
  previous: TrendPoint | null;
  changes: MetricChange[];
  /** 変化の直前(60日以内)に記録された施策 */
  relatedInterventions: Intervention[];
  /** 3 期間以上あるときの一貫した方向 */
  longRun: { metric: "ctr" | "apply"; direction: TrendDirection } | null;
  /** 日本語の考察文。語ることがなければ null */
  narrative: string | null;
}

/** 意味のある変化とみなす最低の変化率 */
const MEANINGFUL = 0.15;

/** 前期比を出すのに必要な最低母数 */
const MIN_IMPRESSIONS = 300;
const MIN_CLICKS = 30;

function toPoint(s: MetricSnapshot): TrendPoint {
  const days = dayCount(s.periodStart, s.periodEnd);
  return {
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    days,
    impressions: s.impressions,
    clicks: s.clicks,
    applies: s.applies,
    ctr: rate(s.clicks, s.impressions),
    applyRate: rate(s.applies, s.clicks),
    impressionsPerDay: s.impressions / days,
    appliesPerMonth: (s.applies * 30) / days,
  };
}

function direction(lift: number): TrendDirection {
  if (lift >= MEANINGFUL) return "up";
  if (lift <= -MEANINGFUL) return "down";
  return "flat";
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const signed = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;

/** 「2026-07-01」を「7月」に */
function monthLabel(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})/);
  return m ? `${Number(m[1])}月` : iso;
}

/** 「2026-08-10」を「8/10」に */
function dateLabel(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : iso;
}

/**
 * 期間の呼び名。
 * 週次だと前後とも同じ月になり「8月 → 8月」と意味のない表示になるため、
 * 短い期間は日付で呼ぶ。
 */
function periodLabel(p: TrendPoint): string {
  return p.days <= 10 ? `${dateLabel(p.periodStart)}の週` : monthLabel(p.periodStart);
}

export function analyzeTrend(
  snapshots: MetricSnapshot[],
  interventions: Intervention[] = [],
  /** 季節指数のカーブ。省略すると季節調整なし */
  seasonCurve?: number[]
): TrendAnalysis {
  const points = [...snapshots]
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .map(toPoint);

  const empty: TrendAnalysis = {
    points,
    latest: points[points.length - 1] ?? null,
    previous: points[points.length - 2] ?? null,
    changes: [],
    relatedInterventions: [],
    longRun: null,
    narrative: null,
  };

  if (points.length < 2) {
    return {
      ...empty,
      narrative:
        points.length === 1
          ? "実績が 1 期間ぶんしかないため、推移はまだ見られません。次の期間を登録すると、前期比の変化と、その間に打った施策の効果まで読めるようになります。"
          : null,
    };
  }

  const after = points[points.length - 1];
  const before = points[points.length - 2];
  const changes: MetricChange[] = [];

  // 前後それぞれの期間の季節指数。お盆や年末の落ち込みを「悪化」と誤読しないために使う
  const curve = seasonCurve;
  const seasonOf = (p: TrendPoint, metric: SeasonMetric) =>
    curve ? seasonFactor(periodSeasonIndex(p.periodStart, p.periodEnd, curve), metric) : 1;

  /** 見かけの変化率から季節要因を取り除く */
  const adjust = (
    lift: number,
    metric: SeasonMetric
  ): { adjustedLift: number; expectedBySeason: number } => {
    const b = seasonOf(before, metric);
    const a = seasonOf(after, metric);
    if (b <= 0 || a <= 0) return { adjustedLift: lift, expectedBySeason: 0 };
    const expectedBySeason = a / b - 1;
    // (実測比 ÷ 季節要因で期待される比) - 1 が実質の変化
    const adjustedLift = (1 + lift) / (a / b) - 1;
    return { adjustedLift, expectedBySeason };
  };

  // --- 表示数(1日あたりで比較。期間の長さが違っても比べられる) ---
  const impLift = relativeLift(before.impressionsPerDay, after.impressionsPerDay);
  if (impLift !== null) {
    const adj = adjust(impLift, "impressions");
    changes.push({
      metric: "impressions",
      label: "表示数",
      before: before.impressionsPerDay,
      after: after.impressionsPerDay,
      lift: impLift,
      ...adj,
      direction: direction(adj.adjustedLift),
      significant: Math.abs(adj.adjustedLift) >= 0.25,
    });
  }

  // --- クリック率 ---
  if (before.impressions >= MIN_IMPRESSIONS && after.impressions >= MIN_IMPRESSIONS) {
    const l = relativeLift(before.ctr, after.ctr);
    if (l !== null) {
      const adj = adjust(l, "ctr");
      changes.push({
        metric: "ctr",
        label: "クリック率",
        before: before.ctr,
        after: after.ctr,
        lift: l,
        ...adj,
        direction: direction(adj.adjustedLift),
        significant: proportionsDiffer(
          before.clicks,
          before.impressions,
          after.clicks,
          after.impressions
        ),
      });
    }
  }

  // --- 応募率 ---
  if (before.clicks >= MIN_CLICKS && after.clicks >= MIN_CLICKS) {
    const l = relativeLift(before.applyRate, after.applyRate);
    if (l !== null) {
      const adj = adjust(l, "apply");
      changes.push({
        metric: "apply",
        label: "応募率",
        before: before.applyRate,
        after: after.applyRate,
        lift: l,
        ...adj,
        direction: direction(adj.adjustedLift),
        significant: proportionsDiffer(
          before.applies,
          before.clicks,
          after.applies,
          after.clicks
        ),
      });
    }
  }

  // --- 直近の変化に関係しそうな施策 ---
  const windowStart = Date.parse(before.periodStart);
  const windowEnd = Date.parse(after.periodEnd);
  const relatedInterventions = interventions.filter((iv) => {
    const t = Date.parse(iv.date);
    return Number.isFinite(t) && t >= windowStart && t <= windowEnd;
  });

  // --- 3 期間以上あるときの一貫した方向 ---
  let longRun: TrendAnalysis["longRun"] = null;
  if (points.length >= 3) {
    const usable = points.filter((p) => p.impressions >= MIN_IMPRESSIONS);
    if (usable.length >= 3) {
      const series = usable.slice(-3).map((p) => p.ctr);
      if (series[0] > series[1] && series[1] > series[2])
        longRun = { metric: "ctr", direction: "down" };
      else if (series[0] < series[1] && series[1] < series[2])
        longRun = { metric: "ctr", direction: "up" };
    }
  }

  return {
    ...empty,
    latest: after,
    previous: before,
    changes,
    relatedInterventions,
    longRun,
    narrative: buildNarrative(
      before,
      after,
      changes,
      relatedInterventions,
      longRun,
      !!seasonCurve
    ),
  };
}

function buildNarrative(
  before: TrendPoint,
  after: TrendPoint,
  changes: MetricChange[],
  interventions: Intervention[],
  longRun: TrendAnalysis["longRun"],
  seasonAware: boolean
): string | null {
  // 判定は季節調整後の値で行う。「見かけは落ちたが、季節を考えれば横ばい」を
  // 悪化として扱わないため
  const moved = changes.filter((c) => c.direction !== "flat");
  const period = `${periodLabel(before)} → ${periodLabel(after)}`;
  const parts: string[] = [];

  // --- 季節要因の説明を先に置く ---
  // 見かけは落ちているのに実質は横ばい以上、というケースが最も誤解を生むので、
  // 数字の話に入る前に「その落ち込みは季節です」と伝える
  const seasonal = changes.filter(
    (c) => Math.abs(c.expectedBySeason) >= 0.05
  );
  const month = dominantMonth(after.periodStart, after.periodEnd);
  if (seasonAware && seasonal.length > 0 && month) {
    const applyChange = seasonal.find((c) => c.metric === "apply") ?? seasonal[0];
    const seasonWord = applyChange.expectedBySeason < 0 ? "落ちる" : "伸びる";
    parts.push(
      `${periodLabel(after)}は${MONTH_NOTE[month]}。` +
        `この時期は例年 ${signed(applyChange.expectedBySeason)} 程度${seasonWord}ので、` +
        `以下の変化はその季節要因を差し引いた実質の値で見ています。`
    );
  }

  if (moved.length === 0) {
    const looked = changes.filter((c) => Math.abs(c.lift) >= MEANINGFUL);
    if (seasonAware && looked.length > 0) {
      // 見かけは動いたが季節で説明がつく = 実は何も起きていない
      parts.push(
        `見かけ上は ${looked.map((c) => `${c.label} ${signed(c.lift)}`).join("、")} と動いていますが、` +
          `季節要因を差し引くと ${looked.map((c) => `${c.label} ${signed(c.adjustedLift)}`).join("、")} で、実質的には横ばいです。` +
          `時期どおりの動きなので、この変化を理由に原稿を触る必要はありません。`
      );
      return parts.join(" ");
    }
    parts.push(
      `${period} で表示数・クリック率・応募率とも大きな変化はありません。数字が動いていないということは、今の状態が自然に良くなることも期待できないので、何か手を打たないと現状のまま推移します。`
    );
    return parts.join(" ");
  }

  const imp = changes.find((c) => c.metric === "impressions");
  const ctr = changes.find((c) => c.metric === "ctr");
  const apply = changes.find((c) => c.metric === "apply");

  // 何が動いたかの事実。季節で説明がつくぶんは分けて示す
  parts.push(
    `${period} の変化: ` +
      moved
        .map((c) => {
          const values =
            c.metric === "impressions"
              ? `${c.before.toFixed(0)} → ${c.after.toFixed(0)} 回/日`
              : `${pct(c.before)} → ${pct(c.after)}`;
          const gapFromSeason = Math.abs(c.lift - c.adjustedLift) >= 0.05;
          return (
            `${c.label} ${values}` +
            (seasonAware && gapFromSeason
              ? `(見かけ ${signed(c.lift)} / 季節要因を除くと ${signed(c.adjustedLift)})`
              : `(${signed(c.lift)})`)
          );
        })
        .join("、") +
      "。"
  );

  // 組み合わせから原因を読む
  if (ctr?.direction === "down" && imp?.direction === "up") {
    parts.push(
      "表示が増えた一方でクリック率が落ちているのは、露出が広がって、もともと関心の薄い層にも出るようになったときの典型的な出方です。予算を増やした直後なら想定内なので、クリック率よりも応募の実数が増えているかで判断してください。"
    );
  } else if (ctr?.direction === "down" && imp?.direction !== "up") {
    parts.push(
      "表示数が増えていないのにクリック率だけ落ちているので、露出の広がりでは説明がつきません。同じエリア・同じ職種に競合求人が増えて相対的に見劣りするようになったか、原稿を変えて逆効果になったかのどちらかを疑ってください。"
    );
  } else if (ctr?.direction === "up" && apply?.direction === "down") {
    parts.push(
      "クリック率は上がったのに応募率が落ちています。一覧での見せ方が実際の条件より魅力的になりすぎて、期待して開いた人が中身とのギャップで離れている可能性があります。キャッチコピーに書いた条件が詳細でも確認できるか見直してください。"
    );
  } else if (imp?.direction === "down" && imp.significant) {
    parts.push(
      "表示数が大きく落ちています。日予算の消化状況、掲載順位、求人の掲載状態(有効期限切れになっていないか)をまず確認してください。原稿の問題ではありません。"
    );
  }

  if (apply?.direction === "down" && ctr?.direction !== "up") {
    parts.push(
      "応募率も落ちているので、応募フォームの設問が増えていないか、募集条件を厳しく書き換えていないかもあわせて確認してください。"
    );
  }

  // 施策との突き合わせ
  if (interventions.length > 0) {
    const dates = interventions.map((iv) => iv.date).join(" / ");
    const improved = moved.filter((c) => c.direction === "up").length;
    const worsened = moved.filter((c) => c.direction === "down").length;
    parts.push(
      `この期間には施策を記録しています(${dates})。` +
        (improved > worsened
          ? "数字は改善方向に動いているので、同じ方向で他の求人にも展開する価値があります。"
          : worsened > improved
            ? "数字は悪化方向に動いています。施策を戻すか、変更した箇所を切り分けて再検証してください。"
            : "改善と悪化が混在しています。変更点を絞って再検証してください。")
    );
  } else if (moved.some((c) => c.significant)) {
    parts.push(
      "この期間に記録された施策はありません。数字が動いた心当たり(掲載条件の変更、予算調整、競合の動き)があれば施策として記録しておくと、次から効果を測れるようになります。"
    );
  }

  if (longRun) {
    parts.push(
      longRun.direction === "down"
        ? "なお、クリック率は3期間連続で下がり続けています。単発のブレではなく、原稿の鮮度か市場の競争環境そのものが変わってきているとみるべきです。"
        : "なお、クリック率は3期間連続で上がっています。今の方向性は合っているので、続けてください。"
    );
  }

  return parts.join(" ");
}
