// 季節変動の補正。
//
// 求人媒体の成果は月によって大きく上下する。お盆と年末年始は求職者が動かず、
// 年明けから3月にかけては最も活発になる。この波を無視すると、次の 3 つが全部おかしくなる:
//
//   1. 診断     — 8月の落ち込みを「原稿が悪い」と誤診する
//   2. 推移     — 7月→8月の自然な減少を「悪化した」と報告してしまう
//   3. 効果測定 — 7月に打った施策を8月の数字で測ると「効かなかった」と誤学習する
//
// 3 が特に厄介で、放置すると学習そのものが壊れる。ここで季節要因を取り除く。
//
// ─────────────────────────────────────────────
// 重要: 「求人が多い時期」と「応募が多い時期」は別物
// ─────────────────────────────────────────────
// 企業側は 8〜10月に求人を出す(10月入社・下期に向けて)が、求職者側は
// 8月のお盆には動かない。調べた各社の記事でこの 2 つが混同されていることが多い。
// このツールが扱うのは応募数なので、採用しているのは「求職者側の動き」のほう。
//
// ─────────────────────────────────────────────
// 出典(2026年8月時点で確認)
// ─────────────────────────────────────────────
// - Indeed Japan「求職者の『仕事探しの時期』に関する調査」
//   仕事検索数は1月に急増し3月にピーク。飲食業のみ5月が最多という異なるサイクル
//   https://jp.indeed.com/news/releases/jobsearchseason
//   https://prtimes.jp/main/html/rd/p/000000178.000028842.html
// - トラコム(Indeed代理店)「いつ採用活動すべき？年間の求職者の動き方」
//   お盆をはさむ時期は採用活動が落ち着くため、あえて出すと目立ちやすい
//   https://www.tracom.co.jp/tralog/recruitment-season-2/
// - マイナビ「中途採用の最適な時期は？統計データから見る繁忙期と閑散期」
//   全体の傾向として3月・4月がピーク
//   https://saponet.mynavi.jp/column/detail/ty_saiyo_t01_best-time-to-recruit_221012.html
// - バイトル「求人募集はどの時期が効果的？」
//   8月は夏休み・お盆で求職者の動きが鈍化。12月は師走で探す人が減る。
//   10〜12月は冬休みの短期バイト需要で学生・フリーターの活動が活発
//   https://www.baitoru.com/solution/column/recruitment-appropriate-time/
// - doda「中途採用に適した時期とは？」/ 転職市場の閑散期は5月と12月
//   https://www.saiyo-doda.jp/guide/kihon/time
// - 日総工産「派遣求人が多い時期はいつ？」
//   派遣が少ないのは大型連休前後(4月末〜5月初)・8月中旬・12月末〜1月初
//   https://www.717450.net/special/knowledge/dispatch_peakseason.html
// - きらケア「介護職の転職時期でベストなのはいつ？」/ 介護は1〜3月が繁忙期
//   https://job.kiracare.jp/note/article/7124/
//
// ⚠ これらは記事ベースの定性情報で、公開された月次指数ではない。
//   あくまで実データが貯まるまでの初期値として扱い、
//   自社データが12か月ぶん貯まれば実測の指数に置き換わる(下の buildSeasonIndex)。

import type { EmploymentTypeId, IndustryId, MetricSnapshot } from "./types";

/**
 * 応募数の季節指数(年平均を 1.0 に正規化して使う)。
 * 数字は「その月に求職者がどれだけ動くか」で、求人掲載側の都合ではない。
 */
const SEED_MONTHLY: Record<number, number> = {
  1: 1.2, // 年明け。心機一転とボーナス後で急増
  2: 1.15, // 年度末に向けて活発
  3: 1.3, // 年間ピーク
  4: 0.95, // 新年度が始まり動きが一段落
  5: 0.9, // GW。転職市場の閑散期
  6: 1.0, // 夏のボーナス前で持ち直す
  7: 0.95, // 夏休み入りで鈍り始める
  8: 0.8, // お盆。年間で最も動かない月のひとつ
  9: 1.05, // 下期の切り替えで回復
  10: 1.1, // 下期採用が活発
  11: 1.0, // 横ばい
  12: 0.8, // 師走・年末年始。年間で最も動かない月のひとつ
};

/** 雇用形態ごとの上書き。学生・主婦層が多いほど学事日程と連休に強く連動する */
const EMPLOYMENT_OVERRIDE: Partial<
  Record<EmploymentTypeId, Partial<Record<number, number>>>
> = {
  // 学生の新学期・履修確定に連動し、長期休暇の落ち込みも大きい
  parttime: { 3: 1.35, 4: 1.05, 5: 0.95, 8: 0.72, 12: 0.85 },
  // 正社員は年明けと下期の切り替えで動く。連休の影響は相対的に小さい
  fulltime: { 1: 1.3, 5: 0.85, 8: 0.85, 9: 1.1, 12: 0.8 },
  contract: { 1: 1.25, 5: 0.88, 8: 0.85, 12: 0.82 },
  // 派遣は大型連休前後の落ち込みがはっきり出る
  dispatch: { 4: 0.9, 5: 0.85, 8: 0.75, 12: 0.78 },
};

/** 業種ごとの上書き */
const INDUSTRY_OVERRIDE: Partial<
  Record<IndustryId, Partial<Record<number, number>>>
> = {
  // 飲食だけは5月がピーク。大学生の履修が確定してからバイトを探し始めるため
  food: { 3: 1.15, 4: 1.15, 5: 1.25, 6: 1.1, 8: 0.85 },
  // 年末の短期需要で11〜12月の応募が落ちにくい
  logistics: { 11: 1.1, 12: 0.95 },
  retail: { 11: 1.1, 12: 1.0, 1: 1.15 },
  // 介護は1〜3月が繁忙期。慢性的な売り手市場で季節の振れ幅は小さめ
  nursing: { 1: 1.25, 2: 1.2, 3: 1.25, 8: 0.85, 12: 0.85 },
  medical: { 1: 1.2, 3: 1.25, 8: 0.85, 12: 0.85 },
};

/**
 * 指標ごとの季節感応度。
 *
 * 季節で変わるのは主に「求職者の母数」なので、影響が最も大きいのは表示数。
 * クリック率は一覧に並んだ求人の中での相対的な選ばれ方なので、
 * 母数が減っても大きくは動かない(そのため感応度を低く置く)。
 * 応募率はその中間で、連休中は「あとで応募しよう」で離脱しやすいぶん少し下がる。
 */
export const SEASON_SENSITIVITY = {
  impressions: 1.0,
  ctr: 0.15,
  apply: 0.4,
} as const;

export type SeasonMetric = keyof typeof SEASON_SENSITIVITY;

/** 月ごとの基礎指数(正規化前)を求める */
function rawMonthIndex(
  month: number,
  industry?: IndustryId,
  employment?: EmploymentTypeId
): number {
  const industryValue = industry
    ? INDUSTRY_OVERRIDE[industry]?.[month]
    : undefined;
  const employmentValue = employment
    ? EMPLOYMENT_OVERRIDE[employment]?.[month]
    : undefined;

  // 業種の上書きは「その業種が一般的な波から外れる」ことを明示した例外なので、
  // 雇用形態の上書きより優先する。
  // (幾何平均にすると、飲食の5月ピークがアルバイト全体の平均に薄められ、
  //  Indeed の調査で確認した「飲食は5月が最多」という特徴が消えてしまう)
  return industryValue ?? employmentValue ?? SEED_MONTHLY[month] ?? 1;
}

/** 年平均が 1.0 になるよう正規化した 12 か月ぶんの指数 */
export function seedSeasonCurve(
  industry?: IndustryId,
  employment?: EmploymentTypeId
): number[] {
  const raw = Array.from({ length: 12 }, (_, i) =>
    rawMonthIndex(i + 1, industry, employment)
  );
  const mean = raw.reduce((a, b) => a + b, 0) / 12;
  return raw.map((v) => v / mean);
}

// ===== 期間の季節指数 =====

/** その期間が各月に何日かかっているかを数える */
function daysByMonth(start: string, end: string): Map<number, number> {
  const out = new Map<number, number>();
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) {
    return out;
  }
  // 期間が長すぎる入力で無限ループにならないよう上限を置く
  const limit = 400;
  let count = 0;
  for (const d = new Date(s); d <= e && count < limit; d.setUTCDate(d.getUTCDate() + 1)) {
    const m = d.getUTCMonth() + 1;
    out.set(m, (out.get(m) ?? 0) + 1);
    count++;
  }
  return out;
}

/**
 * 期間全体の季節指数。月をまたぐ期間は、かかっている日数で加重平均する。
 * 1.0 が年平均並み。0.8 なら「その期間は平年より 2 割動きが少ない時期」。
 */
export function periodSeasonIndex(
  start: string,
  end: string,
  curve: number[]
): number {
  const days = daysByMonth(start, end);
  if (days.size === 0) return 1;
  let sum = 0;
  let total = 0;
  for (const [month, d] of days) {
    sum += (curve[month - 1] ?? 1) * d;
    total += d;
  }
  const monthly = total > 0 ? sum / total : 1;
  // 月の指数に、月の中での強弱(連休)をかけ合わせる。
  // 1 か月まるごとなら後者は 1.0 になるので、月次で見る限り結果は変わらない。
  return monthly * withinMonthFactor(start, end).factor;
}

// ===== 月の中の凹み(長期連休) =====
//
// 月次で見ているぶんには月の指数で足りるが、週次で見ると
// 「8月全体」と「お盆の週」はまったく別物になる。
// 連休にかかる日を安く見積もり、同じ月の他の日をそのぶん高く見積もることで、
// 1 か月ぶんを合計すると必ず月の指数に戻るようにしている(二重に効かせない)。

interface HolidayPeriod {
  name: string;
  /** MM-DD */
  from: string;
  to: string;
  /** 通常日を 1.0 としたときの落ち込み */
  factor: number;
}

const HOLIDAYS: HolidayPeriod[] = [
  { name: "年末年始", from: "12-28", to: "12-31", factor: 0.5 },
  { name: "年末年始", from: "01-01", to: "01-04", factor: 0.55 },
  { name: "お盆", from: "08-10", to: "08-17", factor: 0.65 },
  { name: "ゴールデンウィーク", from: "04-29", to: "05-06", factor: 0.72 },
];

function mmdd(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** その日が連休にかかっていれば、落ち込みの係数と連休名を返す */
function holidayOf(d: Date): HolidayPeriod | null {
  const key = mmdd(d);
  return HOLIDAYS.find((h) => key >= h.from && key <= h.to) ?? null;
}

/** その月の平均係数(連休を含めた月全体の平均)。正規化に使う */
function monthHolidayMean(year: number, month: number): number {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let sum = 0;
  for (let day = 1; day <= days; day++) {
    const d = new Date(Date.UTC(year, month - 1, day));
    sum += holidayOf(d)?.factor ?? 1;
  }
  return sum / days;
}

/**
 * 月の中での相対的な強弱。
 * 1 か月をまるごと渡すと必ず 1.0 になり、連休だけを切り取ると 1 を下回る。
 * 週次で見るときにだけ意味を持つ。
 */
export function withinMonthFactor(
  start: string,
  end: string
): { factor: number; holiday: string | null } {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) {
    return { factor: 1, holiday: null };
  }
  let sum = 0;
  let count = 0;
  const names = new Set<string>();
  const limit = 400;
  for (const d = new Date(s); d <= e && count < limit; d.setUTCDate(d.getUTCDate() + 1)) {
    const h = holidayOf(d);
    const mean = monthHolidayMean(d.getUTCFullYear(), d.getUTCMonth() + 1);
    // その日の係数を、その日が属する月の平均で割って正規化する
    sum += (h?.factor ?? 1) / (mean || 1);
    if (h) names.add(h.name);
    count++;
  }
  return {
    factor: count > 0 ? sum / count : 1,
    holiday: names.size > 0 ? [...names].join("・") : null,
  };
}

/** 指標ごとの感応度をかけた補正係数 */
export function seasonFactor(index: number, metric: SeasonMetric): number {
  return 1 + (index - 1) * SEASON_SENSITIVITY[metric];
}

// ===== 自社データからの学習 =====

/**
 * 登録済みの実績から季節指数を推定する。
 *
 * 求人ごとに「その求人の全期間平均に対する、各月の応募数/日の比」を取り、
 * 求人をまたいで平均する。求人ごとに正規化してから合わせるので、
 * 求人の入れ替わりや規模の違いに影響されない。
 *
 * データが薄いうちはシード値に寄り、月をまたいだ実績が貯まるほど実測に寄る。
 */
export function buildSeasonIndex(
  snapshots: MetricSnapshot[],
  jobIndustry: Map<string, IndustryId>,
  jobEmployment: Map<string, EmploymentTypeId>
): SeasonIndex {
  /** 求人ID → 月 → 応募数/日 の合計と日数 */
  const perJob = new Map<string, Map<number, { applies: number; days: number }>>();

  for (const s of snapshots) {
    const days = daysByMonth(s.periodStart, s.periodEnd);
    const total = [...days.values()].reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    let byMonth = perJob.get(s.jobId);
    if (!byMonth) {
      byMonth = new Map();
      perJob.set(s.jobId, byMonth);
    }
    for (const [month, d] of days) {
      const cur = byMonth.get(month) ?? { applies: 0, days: 0 };
      // 期間の応募数を、月ごとの日数按分で割り当てる
      cur.applies += (s.applies * d) / total;
      cur.days += d;
      byMonth.set(month, cur);
    }
  }

  /** 月 → 観測された相対指数の配列 */
  const observations = new Map<number, number[]>();
  for (const byMonth of perJob.values()) {
    // 3 か月以上のデータがある求人だけを使う(1〜2 か月では比較の基準が作れない)
    if (byMonth.size < 3) continue;
    const rates = [...byMonth.entries()].map(([m, v]) => ({
      month: m,
      rate: v.days > 0 ? v.applies / v.days : 0,
    }));
    const mean = rates.reduce((a, r) => a + r.rate, 0) / rates.length;
    if (mean <= 0) continue;
    for (const r of rates) {
      const list = observations.get(r.month) ?? [];
      list.push(r.rate / mean);
      observations.set(r.month, list);
    }
  }

  const sampleSize = [...observations.values()].reduce(
    (a, l) => a + l.length,
    0
  );

  return new SeasonIndex(observations, sampleSize, jobIndustry, jobEmployment);
}

/** シード値と実測を混ぜる強さ(この件数の観測でちょうど半々になる) */
const SEASON_PRIOR_STRENGTH = 6;

export class SeasonIndex {
  constructor(
    private readonly observations: Map<number, number[]>,
    /** 実測に使えた「求人 × 月」の数 */
    readonly sampleSize: number,
    private readonly jobIndustry: Map<string, IndustryId>,
    private readonly jobEmployment: Map<string, EmploymentTypeId>
  ) {}

  /** 実測がどれだけ効いているか (0〜1) */
  get confidence(): number {
    return this.sampleSize / (this.sampleSize + SEASON_PRIOR_STRENGTH * 12);
  }

  /** 指定の業種・雇用形態の 12 か月カーブ(シード値と実測を混ぜたもの) */
  curve(industry?: IndustryId, employment?: EmploymentTypeId): number[] {
    const seed = seedSeasonCurve(industry, employment);
    const merged = seed.map((seedValue, i) => {
      const obs = this.observations.get(i + 1) ?? [];
      if (obs.length === 0) return seedValue;
      const observed = obs.reduce((a, b) => a + b, 0) / obs.length;
      const w = obs.length;
      return (observed * w + seedValue * SEASON_PRIOR_STRENGTH) /
        (w + SEASON_PRIOR_STRENGTH);
    });
    // 混ぜたあとに年平均 1.0 へ戻す
    const mean = merged.reduce((a, b) => a + b, 0) / 12;
    return mean > 0 ? merged.map((v) => v / mean) : merged;
  }

  /** 求人 ID からカーブを引く */
  curveForJob(jobId: string): number[] {
    return this.curve(this.jobIndustry.get(jobId), this.jobEmployment.get(jobId));
  }

  /** 期間の季節指数 */
  forPeriod(jobId: string, start: string, end: string): number {
    return periodSeasonIndex(start, end, this.curveForJob(jobId));
  }
}

/** 実データがまったくないときに使う、シード値だけの指数 */
export function seedSeasonIndex(): SeasonIndex {
  return new SeasonIndex(new Map(), 0, new Map(), new Map());
}

// ===== 説明文 =====

export const MONTH_NOTE: Record<number, string> = {
  1: "年明けは求職者が最も動き出す時期です。心機一転とボーナス後が重なり、1月から3月にかけて応募が伸びます",
  2: "年度末に向けて求職者の動きが活発な時期です",
  3: "年間で最も応募が集まる月です。競合の求人も増えるため、埋もれない工夫が要ります",
  4: "新年度が始まり、求職者の動きは一段落します",
  5: "GWをはさみ、転職市場としては閑散期にあたります(飲食は例外で、学生の履修確定後にバイト探しが動くため5月がピーク)",
  6: "夏のボーナス前で持ち直す時期です",
  7: "夏休みに入り、求職者の動きが鈍り始めます",
  8: "お盆をはさみ、年間で最も求職者が動かない月のひとつです。応募が落ちるのは自然な変動で、原稿の問題とは限りません。一方で他社も掲載を控えるため、出し続ければ埋もれにくいという利点もあります",
  9: "下期の切り替えで応募が回復してくる時期です",
  10: "下期採用が活発になり、応募が集まりやすい時期です",
  11: "横ばいの時期です。物流・小売では年末の短期需要で動きが出ます",
  12: "師走と年末年始で、年間で最も求職者が動かない月のひとつです。応募の落ち込みは自然な変動です。1月から急増するので、年内に原稿を整えておくと年明けを取り切れます",
};

/** その期間が平年と比べてどういう時期かを一言で */
export function describeSeason(index: number): string | null {
  if (index >= 1.15) return "求職者が平年より活発に動く時期";
  if (index >= 1.05) return "求職者の動きがやや活発な時期";
  if (index <= 0.85) return "求職者が平年より動かない時期";
  if (index <= 0.95) return "求職者の動きがやや鈍い時期";
  return null;
}

/** 期間に含まれる主要な月(最も日数が多い月) */
export function dominantMonth(start: string, end: string): number | null {
  const days = daysByMonth(start, end);
  if (days.size === 0) return null;
  return [...days.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
