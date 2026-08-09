// 業種・雇用形態のマスタと、ベンチマークの初期値(シード)。
//
// ⚠ ここの数値は「実データが 1 件もないときだけ使う暫定の初期値」です。
// 求人媒体の成果は同じ業種でもエリア・予算・時期で大きく振れるため、
// この値そのものを正解として扱ってはいけません。
// 実績を登録するほど lib/indeed/benchmark.ts が自分のデータで置き換えていき、
// シード値の影響は自動的に薄まります(経験ベイズ収縮)。
// 画面には「シード / 実データ何件ぶん」を必ず表示して、判断を誤らせないようにしています。

import type {
  EmploymentTypeDef,
  EmploymentTypeId,
  IndustryDef,
  IndustryId,
} from "./types";

export const INDUSTRIES: IndustryDef[] = [
  {
    id: "manufacturing",
    label: "製造・軽作業",
    tone: "簡潔・安心感・安定訴求",
    hotButtons: ["未経験でもできるか", "立ち仕事の負担", "シフト・残業", "送迎・車通勤", "冷暖房の有無"],
  },
  {
    id: "logistics",
    label: "物流・運輸・ドライバー",
    tone: "簡潔・安心感・安定訴求",
    hotButtons: ["拘束時間", "積み下ろしの有無", "必要な免許", "配送エリア", "week/日給の実態"],
  },
  {
    id: "nursing",
    label: "介護・福祉",
    tone: "温かみ・やりがい訴求",
    hotButtons: ["夜勤の有無と回数", "人員配置", "資格支援", "利用者の要介護度", "残業の実態"],
  },
  {
    id: "medical",
    label: "医療",
    tone: "温かみ・やりがい訴求",
    hotButtons: ["必要資格", "オンコール", "診療科", "残業", "教育体制"],
  },
  {
    id: "food",
    label: "飲食",
    tone: "フレンドリー・スピード感",
    hotButtons: ["シフトの自由度", "まかない", "髪型・服装", "深夜手当", "1日の入り時間"],
  },
  {
    id: "retail",
    label: "販売・接客",
    tone: "フレンドリー・スピード感",
    hotButtons: ["シフト", "ノルマの有無", "服装・髪色", "土日の出勤", "社割"],
  },
  {
    id: "office",
    label: "事務・オフィス",
    tone: "落ち着き・スキルアップ",
    hotButtons: ["使うソフト", "電話対応の量", "残業", "服装", "在宅可否"],
  },
  {
    id: "sales",
    label: "営業",
    tone: "自信・成長・稼ぎ訴求",
    hotButtons: ["インセンティブの実額", "ノルマの実態", "既存/新規の比率", "移動手段", "残業"],
  },
  {
    id: "construction",
    label: "建設・施工",
    tone: "実力主義・安定",
    hotButtons: ["現場エリア", "直行直帰", "資格支援", "日給と月の稼働日数", "道具の支給"],
  },
  {
    id: "it",
    label: "IT・エンジニア",
    tone: "落ち着き・スキルアップ",
    hotButtons: ["使用技術", "在宅・リモート", "常駐か自社か", "残業", "年収レンジ"],
  },
  {
    id: "cleaning",
    label: "清掃・警備",
    tone: "簡潔・安心感・安定訴求",
    hotButtons: ["勤務時間の短さ", "体力面", "シニアの在籍", "現場の場所", "直行直帰"],
  },
  {
    id: "childcare",
    label: "保育・教育",
    tone: "温かみ・やりがい訴求",
    hotButtons: ["持ち帰り仕事", "クラス担当", "行事の負担", "残業", "配置人数"],
  },
  {
    id: "callcenter",
    label: "コールセンター",
    tone: "フレンドリー・スピード感",
    hotButtons: ["受信/発信", "研修期間", "シフトの自由度", "服装", "在宅可否"],
  },
  {
    id: "beauty",
    label: "美容・理容",
    tone: "フレンドリー・スピード感",
    hotButtons: ["指名歩合", "練習時間", "休日", "客単価", "スタイリストデビュー"],
  },
  {
    id: "other",
    label: "その他",
    tone: "簡潔・分かりやすさ重視",
    hotButtons: ["仕事の具体的な中身", "勤務時間", "休日", "給与", "勤務地"],
  },
];

export const EMPLOYMENT_TYPES: EmploymentTypeDef[] = [
  { id: "fulltime", label: "正社員", wageUnit: "monthly" },
  { id: "contract", label: "契約社員", wageUnit: "monthly" },
  { id: "parttime", label: "アルバイト・パート", wageUnit: "hourly" },
  { id: "dispatch", label: "派遣", wageUnit: "hourly" },
  { id: "outsourcing", label: "業務委託", wageUnit: "daily" },
];

export function industryDef(id: IndustryId): IndustryDef {
  return INDUSTRIES.find((i) => i.id === id) ?? INDUSTRIES[INDUSTRIES.length - 1];
}

export function industryLabel(id: IndustryId): string {
  return industryDef(id).label;
}

export function employmentDef(id: EmploymentTypeId): EmploymentTypeDef {
  return EMPLOYMENT_TYPES.find((e) => e.id === id) ?? EMPLOYMENT_TYPES[0];
}

export function employmentLabel(id: EmploymentTypeId): string {
  return employmentDef(id).label;
}

/** 業種ごとのシード値(実データ 0 件のときの出発点) */
export interface SeedRates {
  /** クリック率 = クリック数 / 表示数 */
  ctr: number;
  /** 応募率 = 応募数 / クリック数 */
  applyRate: number;
}

/**
 * 業種別のシード値。
 * 「人気職種ほど CTR は高いが応募率は競合に流れて伸びない」「資格職は母数が少なく
 * 応募率が低い」といった、求人媒体で一般に観測される傾向を出発点として置いている。
 * 繰り返しになるが、実データが入り次第これは上書きされる。
 */
export const SEED_BY_INDUSTRY: Record<IndustryId, SeedRates> = {
  manufacturing: { ctr: 0.04, applyRate: 0.08 },
  logistics: { ctr: 0.035, applyRate: 0.06 },
  nursing: { ctr: 0.035, applyRate: 0.05 },
  medical: { ctr: 0.03, applyRate: 0.045 },
  food: { ctr: 0.045, applyRate: 0.07 },
  retail: { ctr: 0.042, applyRate: 0.07 },
  office: { ctr: 0.05, applyRate: 0.09 },
  sales: { ctr: 0.03, applyRate: 0.04 },
  construction: { ctr: 0.032, applyRate: 0.05 },
  it: { ctr: 0.03, applyRate: 0.035 },
  cleaning: { ctr: 0.038, applyRate: 0.075 },
  childcare: { ctr: 0.036, applyRate: 0.055 },
  callcenter: { ctr: 0.045, applyRate: 0.08 },
  beauty: { ctr: 0.035, applyRate: 0.05 },
  other: { ctr: 0.035, applyRate: 0.06 },
};

/**
 * 雇用形態による補正。
 * アルバイト・パートは応募のハードルが低く、正社員・業務委託は検討期間が長い。
 */
export const SEED_EMPLOYMENT_MULTIPLIER: Record<
  EmploymentTypeId,
  SeedRates
> = {
  fulltime: { ctr: 0.95, applyRate: 0.85 },
  contract: { ctr: 1.0, applyRate: 0.95 },
  parttime: { ctr: 1.05, applyRate: 1.2 },
  dispatch: { ctr: 1.0, applyRate: 1.0 },
  outsourcing: { ctr: 0.9, applyRate: 0.7 },
};

/**
 * 1 日あたり表示数のシード値。予算で大きく変わるため広めに構える。
 * unknown は掲載形態が未設定のとき用で、有料・無料の中間(幾何平均)に置く。
 * 未設定を無料掲載とみなすと基準が下がり、露出不足の求人まで「良好」と
 * 判定してしまうため、決めつけずに中間を使う。
 */
export const SEED_IMPRESSIONS_PER_DAY = {
  sponsored: 220,
  organic: 45,
  unknown: Math.round(Math.sqrt(220 * 45)), // 約 99
};

/**
 * 求人ごとの成果のばらつき(四分位の広がり)。
 * 実データが 5 件未満のセグメントでは、この係数で p25 / p75 を作る。
 */
export const SEED_SPREAD = { p25: 0.62, p75: 1.5 };

/** 表示数のばらつきは率よりずっと大きい */
export const SEED_IMPRESSION_SPREAD = { p25: 0.35, p75: 2.4 };

/** 業種 × 雇用形態のシード値を返す */
export function seedRates(
  industry: IndustryId,
  employmentType: EmploymentTypeId
): SeedRates {
  const base = SEED_BY_INDUSTRY[industry] ?? SEED_BY_INDUSTRY.other;
  const mul = SEED_EMPLOYMENT_MULTIPLIER[employmentType] ?? SEED_EMPLOYMENT_MULTIPLIER.dispatch;
  return {
    ctr: base.ctr * mul.ctr,
    applyRate: base.applyRate * mul.applyRate,
  };
}

/** 全 47 都道府県 */
export const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];
