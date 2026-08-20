// note 収益化スタジオが扱うデータの形。
//
// 「案件(Project)」が 1 つの note アカウントに対応する。
// 自分用でも顧客用でも同じ形で持つ。1 アカウント = 1 案件。

// ===== ① 持ち札(ヒアリング) =====
// 記事の質はここで決まる。AIは持っていない情報を作れないので、
// 実績の数字と現場のエピソードが空だと、当たり障りのない記事しか出ない。

export interface OwnerProfile {
  /** note で名乗る名前(本名でなくてよい) */
  displayName: string;
  /** 経歴・肩書き。「何者か」が伝わる一文 */
  background: string;
  /** ★ 実績。必ず数字で。例「採用単価を12万→3.8万に下げた」 */
  achievements: string;
  /** ★ 現場のエピソード。具体的な場面・会話・失敗 */
  experiences: string;
  /** できること・持っている道具(ツール、資格、社内データなど) */
  skills: string;
  /** 届けたい人。誰の何を解決するか */
  targetReader: string;
  /** 書けないこと。顧客の実名・未公開の数字など */
  ngTopics: string;
  /** 週に note に使える時間(時間) */
  hoursPerWeek: number;
  /**
   * 狙う月の【手取り】(円)。
   *
   * 売上ではなく手取りで持つ。note の売上は手数料で 2 割近く引かれるため、
   * 売上で目標を置くと、計画どおり売れても手元の額が目標に届かない。
   * 必要な売上は lib/revenue.ts の grossNeededFor() で逆算する。
   */
  monthlyGoalYen: number;
  /** 使う収益モデル */
  revenueModels: RevenueModel[];
  /** 本業の商品・サービス(バックエンド導線を使う場合) */
  backendOffer: string;
  /** すでに note アカウントがある場合の urlname。無ければ空 */
  existingUrlname: string;
}

export type RevenueModel = "single" | "membership" | "backend" | "template";

export const REVENUE_MODEL_LABELS: Record<RevenueModel, string> = {
  single: "単品の有料記事",
  membership: "メンバーシップ(月額)",
  backend: "本業バックエンドへの導線",
  template: "テンプレート・ツール販売",
};

// ===== ② 競合リサーチ =====

export interface ResearchStats {
  /** 調べたキーワード */
  keyword: string;
  /** 集められた記事の数 */
  sampleSize: number;
  /** そのうち有料記事の数 */
  paidCount: number;
  /** 有料記事の割合(0〜1) */
  paidRatio: number;
  /** 有料記事の価格。円 */
  priceMin: number | null;
  priceMedian: number | null;
  priceMax: number | null;
  /** よく使われる価格(円 → 本数) */
  priceHistogram: { price: number; count: number }[];
  /** スキ数 */
  likeMedian: number | null;
  likeMax: number | null;
  /** 有料記事のスキ数の中央値(有料でも読まれているか) */
  paidLikeMedian: number | null;
  /** 直近90日に投稿された記事の割合(市場が生きているか) */
  freshRatio: number | null;
  /** 頻出ハッシュタグ */
  topTags: { tag: string; count: number }[];
  /** よく出る書き手 */
  topCreators: { urlname: string; nickname: string | null; count: number; paidCount: number }[];
  /** タイトルによく入る語 */
  titleWords: { word: string; count: number }[];
}

export interface CompetitorProfile {
  urlname: string;
  nickname: string | null;
  profile: string | null;
  followerCount: number | null;
  noteCount: number | null;
  url: string;
  /** 取得した記事のうち有料の本数 */
  paidCount: number;
  sampledCount: number;
  priceMedian: number | null;
  likeMedian: number | null;
  /** 平均何日に1本出しているか */
  postIntervalDays: number | null;
  /** 伸びた記事(スキ順の上位) */
  topArticles: { title: string; url: string; price: number | null; likeCount: number | null }[];
}

/** AIが読んだリサーチの結論 */
export interface ResearchAnalysis {
  /** この市場が今どうなっているかの要約 */
  marketSummary: string;
  /** 売れている記事に共通する型 */
  winningPatterns: { pattern: string; evidence: string; howToUse: string }[];
  /** 相場として妥当な価格帯 */
  priceGuidance: { range: string; reason: string; recommendedStart: number };
  /** まだ誰も書いていない空白 */
  gaps: { gap: string; why: string; difficulty: "低" | "中" | "高" }[];
  /** 勝てない土俵(降りるべき戦い) */
  avoid: { topic: string; reason: string }[];
  /** 参入難易度の総合判定 */
  entryDifficulty: { level: "低" | "中" | "高"; reason: string };
  /** データが薄い項目の断り書き */
  caveats: string[];
}

export interface ResearchResult {
  ranAt: string;
  keywords: string[];
  stats: ResearchStats[];
  competitors: CompetitorProfile[];
  analysis: ResearchAnalysis;
  /** 取得の記録(何件取れたか・失敗したか) */
  fetchLogs: { url: string; status: number | string; items: number; note?: string }[];
}

// ===== ③ ジャンル選定 =====

export interface GenreCandidate {
  name: string;
  /** 誰に何を約束するジャンルか */
  positioning: string;
  /** 4項目の点数(各25点満点) */
  scores: {
    /** 市場に読者と支払い意思があるか */
    demand: number;
    /** あなたにしか書けない一次情報があるか */
    uniqueness: number;
    /** 週の使える時間で回せるか */
    sustainability: number;
    /** 単価を上げやすいか・バックエンドに繋がるか */
    monetization: number;
  };
  total: number;
  /** 点数の根拠。リサーチのどの数字を見たか */
  rationale: string;
  /** このジャンルの弱点 */
  risk: string;
  /** 月商目標に届くまでの想定 */
  pathToGoal: string;
}

export interface GenreDecision {
  decidedAt: string;
  candidates: GenreCandidate[];
  /** 推奨するジャンル名(candidates のいずれか) */
  recommended: string;
  /** なぜこれを選んだか。他を選ばなかった理由も含む */
  reasoning: string;
  /** 選んだジャンルで最初に書くべき記事のテーマ */
  firstThemes: string[];
}

// ===== ④ アカウント設計 =====

export interface AccountDesign {
  designedAt: string;
  /** クリエイター名(表示名) */
  creatorName: string;
  /** urlname の案 */
  urlnameOptions: string[];
  /** 肩書き一行。プロフィールの先頭に置く */
  tagline: string;
  /** プロフィール文(note のプロフィール欄にそのまま貼る) */
  profileText: string;
  /** ヘッダー画像の方針 */
  headerDirection: string;
  /** アイコンの方針 */
  iconDirection: string;
  /** 固定記事(プロフィール記事)の構成 */
  pinnedArticle: { title: string; outline: string[]; purpose: string };
  /** 使うハッシュタグの基本セット */
  coreHashtags: string[];
  /** マガジンの分け方 */
  magazines: { name: string; purpose: string; contents: string }[];
  /** メンバーシップ設計(使う場合のみ) */
  membership: {
    use: boolean;
    name: string;
    monthlyPriceYen: number;
    benefits: string[];
    /** 単品有料記事と食い合わないための線引き */
    boundary: string;
    /** 目標人数と、そのときの月商 */
    targetMembers: number;
  } | null;
  /** 本業への導線(使う場合のみ) */
  backendFunnel: {
    use: boolean;
    /** 記事末尾に置く CTA の文面 */
    ctaText: string;
    /** どの記事に置き、どの記事に置かないか */
    placementRule: string;
  } | null;
}

// ===== ⑤ 運用計画 =====

export interface PlanPhase {
  /** 第1期 / 第2期 … */
  label: string;
  /** 何日目〜何日目 */
  days: string;
  /** この期間のゴール(数字で) */
  goal: string;
  /** 出す記事の内訳 */
  output: string;
  /** この期間にやること */
  actions: string[];
  /** 次の期に進んでよい判断基準 */
  exitCriteria: string;
}

export interface PlannedArticle {
  /** 通し番号 */
  no: number;
  /** 何日目に出すか */
  day: number;
  title: string;
  /** 無料 / 有料 / メンバーシップ限定 */
  kind: "free" | "paid" | "members";
  priceYen: number | null;
  /** この記事の役目 */
  role: string;
  /** 何を書くか */
  summary: string;
  /** 使うハッシュタグ */
  hashtags: string[];
}

export interface OperationPlan {
  plannedAt: string;
  /** 月商目標に到達する筋道の説明 */
  revenueMath: {
    /** 目標の手取り(円) */
    netGoalYen: number;
    /** その手取りに必要な売上(円)。手数料を戻した額 */
    goalYen: number;
    /** 内訳。「3,000円 × 20本 = 60,000円」など */
    breakdown: { source: string; unitYen: number; unitsPerMonth: number; subtotalYen: number }[];
    /** 前提としている購入率などの根拠 */
    assumptions: string[];
    /** 到達までの想定月数 */
    monthsToGoal: number;
  };
  phases: PlanPhase[];
  /** 90日分の記事ラインナップ */
  calendar: PlannedArticle[];
  /** 週あたりの作業の回し方(使える時間に合わせる) */
  weeklyRoutine: { day: string; task: string; minutes: number }[];
  /** 伸びないときの立て直し手順 */
  recoveryPlaybook: { symptom: string; check: string; action: string }[];
}

// ===== ⑥ 記事 =====

export interface Article {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** 計画のどの記事か(手動作成なら null) */
  planNo: number | null;
  kind: "free" | "paid" | "members";
  /** 採用したタイトル */
  title: string;
  /** タイトルの別案 */
  titleOptions: string[];
  /** リード(冒頭の掴み) */
  lead: string;
  /** 無料で読める本文(Markdown) */
  freeBody: string;
  /** 有料ラインの直前に置く「ここから先の予告」 */
  paywallPitch: string;
  /** 有料部分の本文(Markdown)。無料記事なら空 */
  paidBody: string;
  /** 記事末尾の CTA */
  cta: string;
  priceYen: number | null;
  hashtags: string[];
  /** 導入部の写真・図の指示 */
  visualDirection: string;
  /** AIが埋められなかった、あなたが入れる必要のある一次情報 */
  fillIns: { where: string; what: string }[];
  /** note に貼り付けるための整形済みテキスト */
  pasteText: string;
  /** 公開したかどうか(実績入力の対象になる) */
  published: boolean;
  publishedUrl: string;
}

// ===== ⑦ 実績と次の打ち手 =====

export interface MetricEntry {
  id: string;
  recordedAt: string;
  /** 対象の記事(全体の記録なら null) */
  articleId: string | null;
  views: number | null;
  likes: number | null;
  /** 販売数 */
  sales: number | null;
  /** 売上(円)。note の管理画面に出る額 */
  revenueYen: number | null;
  /**
   * 手取り(円)。振込で実際に入った額。
   * 分かるときだけ入れる。入っていれば、進捗の判定はこちらを優先する
   * (手数料の概算より、実額のほうが正しいため)。
   */
  netYen: number | null;
  /** フォロワー数(その時点) */
  followers: number | null;
  /** メンバーシップ会員数 */
  members: number | null;
  memo: string;
}

/** 実績を読んだAIの判定 */
export interface NextMove {
  judgedAt: string;
  /** 月商目標に対して今どこにいるか */
  standing: {
    /** 直近1か月の手取り(円) */
    currentMonthlyYen: number;
    /** 目標の手取り(円) */
    goalYen: number;
    gapYen: number;
    verdict: string;
  };
  /** どこが詰まっているか。読まれていない / 読まれるが買われない など */
  bottleneck: { stage: string; evidence: string };
  /** 次にやること。上から順に */
  actions: { priority: number; action: string; why: string; expectedEffect: string }[];
  /** やめること */
  stopDoing: string[];
  /** 書き直したほうがよい記事 */
  rewriteTargets: { articleTitle: string; problem: string; fix: string }[];
}

// ===== 案件全体 =====

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** 作った人の名前(監査用) */
  createdBy: string;
  profile: OwnerProfile;
  research: ResearchResult | null;
  genre: GenreDecision | null;
  account: AccountDesign | null;
  plan: OperationPlan | null;
  articles: Article[];
  metrics: MetricEntry[];
  nextMove: NextMove | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  /** どこまで進んだか */
  steps: { research: boolean; genre: boolean; account: boolean; plan: boolean; articles: number };
  /** 直近1か月の手取り(円) */
  latestMonthlyYen: number;
  /** 目標の手取り(円) */
  goalYen: number;
}

export function emptyProfile(): OwnerProfile {
  return {
    displayName: "",
    background: "",
    achievements: "",
    experiences: "",
    skills: "",
    targetReader: "",
    ngTopics: "",
    hoursPerWeek: 4,
    monthlyGoalYen: 100000,
    revenueModels: ["single", "membership", "backend"],
    backendOffer: "",
    existingUrlname: "",
  };
}
