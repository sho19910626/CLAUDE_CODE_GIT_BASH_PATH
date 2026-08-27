// Indeed 求人パフォーマンス診断のデータモデル。
//
// 扱う数値は Indeed の管理画面から取れる 4 つだけ:
//   表示数 (impressions) → クリック数 (clicks) → 応募数 (applies)、および任意で費用 (cost)
// CTR と応募率はこの 3 つから必ず計算で求める(入力された CTR/応募率は検算にのみ使う)。

// ===== マスタ =====

/** 業種。求人媒体の運用で診断の軸になる粒度で切っている */
export type IndustryId =
  | "manufacturing"
  | "logistics"
  | "nursing"
  | "medical"
  | "food"
  | "retail"
  | "office"
  | "sales"
  | "construction"
  | "it"
  | "cleaning"
  | "childcare"
  | "callcenter"
  | "beauty"
  | "other";

export interface IndustryDef {
  id: IndustryId;
  label: string;
  /** 原稿のトーン(job-rewrite スキルの業種別トーンと揃えている) */
  tone: string;
  /** その業種の求職者が特に気にする条件。提案の根拠に使う */
  hotButtons: string[];
}

/** 雇用形態 */
export type EmploymentTypeId =
  | "fulltime"
  | "contract"
  | "parttime"
  | "dispatch"
  | "outsourcing";

export interface EmploymentTypeDef {
  id: EmploymentTypeId;
  label: string;
  /** 給与の一般的な単位 */
  wageUnit: WageType;
}

/** 給与の提示単位 */
export type WageType = "hourly" | "daily" | "monthly" | "annual";

/** ファネルの段階。診断はこの 3 段階のどこが詰まっているかを特定する */
export type FunnelStage = "impressions" | "ctr" | "apply";

// ===== 求人マスタ =====

/** 給与の提示内容。相場との比較と、上限表記の有無の判定に使う */
export interface WageInfo {
  type: WageType;
  /** 下限(単一提示のときはここだけ埋める) */
  min?: number;
  /** 上限。未設定なら「単一提示」とみなす */
  max?: number;
}

/** 掲載中の原稿。登録すると提案の精度が上がるが、未登録でも診断は動く */
export interface JobCopy {
  /** Indeed の求人タイトル */
  title?: string;
  /** キャッチコピー(スプレッドシートの F 列に相当) */
  catch?: string;
  /** 仕事内容(スプレッドシートの G 列に相当) */
  description?: string;
}

/** 応募までの障壁。応募率の診断で使う */
export interface ApplyFriction {
  /** 応募フォームの設問数(Indeed の応募質問) */
  questionCount?: number;
  /** 履歴書の添付を必須にしているか */
  requiresResume?: boolean;
  /** 選考フロー・返信目安を原稿に書いているか */
  hasSelectionFlow?: boolean;
}

export interface JobRecord {
  id: string;
  /** 管理用の求人名 */
  name: string;
  /** クライアント企業名 */
  company: string;
  industry: IndustryId;
  /** 職種(例: フォークリフト、介護スタッフ)。セグメントの最小単位 */
  jobCategory: string;
  employmentType: EmploymentTypeId;
  prefecture: string;
  city?: string;
  wage?: WageInfo;
  /** スポンサー(有料掲載)かどうか */
  sponsored?: boolean;
  /** 掲載開始日 (YYYY-MM-DD) */
  postedAt?: string;
  /** 求人に職場写真を載せているか */
  hasPhotos?: boolean;
  copy?: JobCopy;
  friction?: ApplyFriction;
  createdAt: string;
  updatedAt: string;
  /** 掲載終了した求人。ベンチマークの学習には使うが一覧では畳む */
  archived?: boolean;
}

// ===== 実績スナップショット =====

/** ある期間の実績。同じ求人に対して何期間ぶんでも積める */
export interface MetricSnapshot {
  id: string;
  jobId: string;
  /** 集計期間 (YYYY-MM-DD) */
  periodStart: string;
  periodEnd: string;
  impressions: number;
  clicks: number;
  applies: number;
  /** 広告費(任意)。入れると応募単価 (CPA) を出せる */
  cost?: number;
  note?: string;
  createdAt: string;
}

// ===== 施策と学習 =====

/**
 * 実施した改善施策の記録。
 * これが学習の入力になる: 施策日の前後の実績を比べて効果量を測り、
 * 次回以降の提案の並び順に反映する。
 */
export interface Intervention {
  id: string;
  jobId: string;
  /** 施策を反映した日 (YYYY-MM-DD)。この日を境に前後を比較する */
  date: string;
  /** 実施した施策 (PlaybookAction.id)。複数同時実施も記録できる */
  actionIds: string[];
  note?: string;
  createdAt: string;
}

/** 施策 1 件から測定した効果 */
export interface LiftObservation {
  interventionId: string;
  jobId: string;
  industry: IndustryId;
  actionId: string;
  stage: FunnelStage;
  /** 施策前の指標値(CTR または応募率) */
  before: number;
  /** 施策後の指標値 */
  after: number;
  /** 季節要因を取り除いた相対リフト率。+0.25 なら 25% 改善。学習に使うのはこちら */
  lift: number;
  /** 季節補正前の見かけのリフト率。画面に「見かけ vs 実質」を出すのに使う */
  rawLift: number;
  /** 前後の期間の季節指数の比。1 未満なら不利な時期に測っている */
  seasonAdjustment: number;
  /** 同時実施した施策数。1/n を効果の帰属重みにする */
  sharedWith: number;
  /** 統計的に有意(2 標本の Wilson 区間が重ならない)か */
  significant: boolean;
  /** 前後それぞれの母数(表示数 or クリック数)。信頼度の目安 */
  beforeDenominator: number;
  afterDenominator: number;
}

/** 施策ごとに学習した効果量 */
export interface LearnedEffect {
  actionId: string;
  /** シード値と実測値を混ぜた期待リフト率(提案の並び替えに使う) */
  expectedLift: number;
  /** 実測のみの平均リフト率。観測 0 件なら null */
  measuredLift: number | null;
  /** 有効な観測数 */
  sampleSize: number;
  /** 改善した割合 (0〜1)。観測 0 件なら null */
  winRate: number | null;
  /** 実測がシード値をどれだけ上書きしているか (0〜1)。学習の進み具合 */
  confidence: number;
}

// ===== ベンチマーク =====

/** ベンチマークをどの粒度で引けたか。粒度が細かいほど提案の説得力が高い */
export type BenchmarkLevel =
  | "job-category" // 業種 × 職種 × 雇用形態
  | "industry-employment" // 業種 × 雇用形態
  | "industry" // 業種
  | "all" // 全データ
  | "seed"; // 実データなし(初期値)

/** ある指標のベンチマーク */
export interface MetricBenchmark {
  /** 中央値相当。経験ベイズで上位階層に収縮させた推定値 */
  center: number;
  /** 下位 25% 相当。これを下回ると「低い」 */
  p25: number;
  /** 上位 25% 相当。改善の目標値に使う */
  p75: number;
}

export interface SegmentBenchmark {
  level: BenchmarkLevel;
  /** ベンチマークの根拠になった求人数 */
  jobCount: number;
  /** 根拠になった表示数の合計 */
  impressions: number;
  ctr: MetricBenchmark;
  applyRate: MetricBenchmark;
  /** 1 日あたり表示数 */
  impressionsPerDay: MetricBenchmark;
  /** このセグメントのラベル(画面表示用) */
  label: string;
}

// ===== 診断結果 =====

/** 集計済みの実績 */
export interface AggregatedMetrics {
  impressions: number;
  clicks: number;
  applies: number;
  cost?: number;
  /** 集計対象の日数 */
  days: number;
  ctr: number;
  applyRate: number;
  /** 表示から応募までの通過率 */
  overallRate: number;
  impressionsPerDay: number;
  appliesPerDay: number;
  /** 1 日あたりの費用。予算を使い切っているかの手がかりになる */
  costPerDay?: number;
  /** クリック単価。cost 未入力なら undefined */
  cpc?: number;
  /** 応募単価。cost 未入力なら undefined */
  cpa?: number;
}

/**
 * 応募単価の内訳。
 *
 * 応募単価 = クリック単価 ÷ 応募率 と分解できる。
 * 「応募単価が高い」とき、原因がクリック側(入札・競合)なのか
 * 応募側(原稿・応募フロー)なのかで打ち手がまったく違うため、
 * どちらが効いているかを数字で切り分ける。
 */
export interface CostBreakdown {
  cpa: number;
  cpc: number;
  applyRate: number;
  /** 比較相手(同じ業種・職種・雇用形態の中央値)。データ不足なら undefined */
  benchmarkCpc?: number;
  benchmarkCpa?: number;
  /** 主因。cpc = クリックが高い、applyRate = 応募率が低い、both、none */
  driver: "cpc" | "applyRate" | "both" | "none";
  /**
   * クリック単価だけを相場に戻したときの応募単価。
   * 「入札を直せばここまで下がる」の目安。
   */
  cpaIfCpcFixed?: number;
  /** 応募率だけを相場に戻したときの応募単価 */
  cpaIfApplyRateFixed?: number;
}

/**
 * お金の見立てと、そこから出てくる打ち手。
 *
 * 「単価が高い」で終わらせず、この求人の実数から
 * 「いくらにするか」「その結果どうなるか」まで出す。
 */
export interface MoneyNote {
  /** 診断の文章 */
  text: string;
  /** この求人で具体的にやること(数字入り) */
  actions: string[];
  /** 職種名の言い換え案。長いので箇条書きとは分けて表示する */
  titleIdeas: { title: string; reason: string }[];
  /** クライアントへの伝え方。報告書にそのまま貼れる一文 */
  clientNote: string | null;
}

/** 段階ごとの判定 */
export type StageVerdict = "good" | "average" | "weak" | "insufficient";

export interface StageDiagnosis {
  stage: FunnelStage;
  label: string;
  verdict: StageVerdict;
  /** 実測値 */
  value: number;
  /** ベンチマークの中央値 */
  benchmark: number;
  /** 目標値(ベンチマーク上位 25%) */
  target: number;
  /** ベンチマーク比 (1.0 = 同水準) */
  ratio: number;
  /** 実測値の 95% 信頼区間。母数が小さいときの過剰反応を防ぐ */
  ci: { low: number; high: number };
  /** この段階を上位25%(target)まで改善したときに増える月間応募数の試算 */
  potentialGain: number;
  /**
   * ベンチマークの中央値まで戻したときの月間応募増。
   * 大きく下回っている求人に「上位25%まで行けます」と言うのは現実的でないため、
   * 考察ではまずこちらを本線として示す。
   */
  realisticGain: number;
  /** 判定の根拠を日本語で説明した文 */
  reason: string;
}

export interface JobDiagnosis {
  jobId: string;
  metrics: AggregatedMetrics;
  /** 診断対象の期間の季節に合わせて補正済みのベンチマーク */
  benchmark: SegmentBenchmark;
  /** 診断対象の期間が平年と比べてどういう時期か */
  season: {
    /** 1.0 が平年並み。0.8 なら平年より 2 割動きが少ない時期 */
    index: number;
    /** 「求職者が平年より動かない時期」など。平年並みなら null */
    label: string | null;
    /** ベンチマークを季節補正したか */
    adjusted: boolean;
  };
  stages: StageDiagnosis[];
  /** 最も伸びしろが大きい段階。null は「データ不足」または「課題なし」 */
  bottleneck: FunnelStage | null;
  /** 診断全体の要約文 */
  summary: string;
  /** データが判定に足りているか */
  dataSufficiency: {
    ctrOk: boolean;
    applyOk: boolean;
    message: string;
  };
}

// ===== 提案 =====

export interface Recommendation {
  actionId: string;
  stage: FunnelStage;
  title: string;
  /** なぜ効くのか */
  why: string;
  /** 具体的にやること */
  how: string[];
  /** この求人でその施策を提案する根拠(実データから作った文) */
  evidence: string;
  /** 期待できる月間応募増(件) */
  expectedGain: number;
  /** 期待リフト率 */
  expectedLift: number;
  /** 実施の重さ 1(すぐ)〜3(重い) */
  effort: 1 | 2 | 3;
  /** 優先度スコア = 期待応募増 / 工数 */
  priority: number;
  /** 効果量の学習状況 */
  learning: LearnedEffect;
  /** 原稿が未登録で、条件を確認できないまま提案しているか */
  unverified: boolean;
}

// ===== ストア =====

export interface IndeedStore {
  version: 1;
  jobs: JobRecord[];
  snapshots: MetricSnapshot[];
  interventions: Intervention[];
}

// ===== AI 原稿提案 API =====

export interface AdviceRequest {
  job: JobRecord;
  metrics: AggregatedMetrics;
  diagnosis: JobDiagnosis;
  recommendations: Recommendation[];
}

export interface AdviceResult {
  /** お客様へそのまま出せる報告文(現状 → 原因 → 打ち手) */
  clientReport: string;
  /** Indeed の求人タイトル案 */
  titleIdeas: string[];
  /** キャッチコピー案(全角 70 文字以内) */
  catchIdeas: string[];
  /** 仕事内容のリライト案(◆◆ フォーマット) */
  descriptionDraft: string;
  /** 原稿以外で先に手を打つべきこと */
  operationNotes: string[];
}
