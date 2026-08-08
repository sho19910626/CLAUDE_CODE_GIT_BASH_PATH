// Indeed 求人提案ツールの型定義。
// API ルートの構造化出力 (lib/indeed-schema.ts) と 1:1 で対応させる。

/** 雇用形態。提案のトーン・訴求軸・原稿の粒度をこれで切り替える */
export type EmploymentType = "parttime" | "fulltime" | "newgrad" | "contract";

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  parttime: "アルバイト・パート",
  fulltime: "正社員(中途)",
  newgrad: "正社員(新卒)",
  contract: "契約社員・派遣・業務委託",
};

/** ヒアリングシート。企業名と事業内容以外はすべて任意 */
export interface HearingSheet {
  employmentType: EmploymentType;
  /** 企業HP・採用サイトのURL(任意。取得できればAIが参照する) */
  url: string;
  companyName: string;
  /** 事業内容・どんな会社か */
  business: string;
  /** 募集職種・ポジション */
  position: string;
  /** 勤務地・エリア */
  workplace: string;
  /** 給与(時給/月給/年収)・待遇 */
  salary: string;
  /** 勤務時間・シフト */
  hours: string;
  /** 休日・休暇 */
  holidays: string;
  /** 福利厚生 */
  benefits: string;
  /** 応募条件・必須スキル */
  requirements: string;
  /** 選考フロー */
  selectionFlow: string;
  /** ★ 実際に活躍している人の特徴(棲み分け設計の最重要インプット) */
  topPerformers: string;
  /** ★ 活躍している人の具体的なエピソード・日常の一場面 */
  episode: string;
  /** すぐ辞めてしまう人・合わなかった人の特徴 */
  mismatch: string;
  /** 職場の雰囲気・一緒に働くメンバー */
  atmosphere: string;
  /** 採用競合(同エリア・同職種で応募者を取り合う相手) */
  competitors: string;
  /** 現在の採用課題(応募が来ない/質が低い/辞退される/定着しない など) */
  issues: string;
  /** これまでの求人でアピールしてきた内容 */
  currentAppeal: string;
  /** 採用人数・時期・予算 */
  budget: string;
  /** その他ヒアリングメモ(自由記述) */
  memo: string;
}

export interface ProposalSummary {
  companyName: string;
  industry: string;
  employmentType: string;
  positionLabel: string;
  /** 提案全体を一文で */
  oneLine: string;
}

export interface Diagnosis {
  /** 今戦っている土俵 */
  currentStage: string;
  /** その土俵での序列・立ち位置 */
  currentRank: string;
  /** 勝てない理由 */
  whyLosing: string[];
  /** 現状のままだと集まってしまう人の実像 */
  applicantReality: string;
  /** 放置した場合に起きること */
  riskIfUnchanged: string;
}

export interface Persona {
  /** 「〇〇な人材」— 情景が浮かぶ一文 */
  label: string;
  whoTheyAreNow: string;
  dailyLife: string;
  currentPain: string;
  /** この求人を見た瞬間に刺さる一点 */
  trigger: string;
  /** Indeedで実際に打ちそうな検索語 */
  whereTheySearch: string[];
}

export interface Positioning {
  /** 仕事の再定義 */
  reframe: { from: string; to: string };
  /** 新しく棲み分ける土俵の名前 */
  newStage: string;
  persona: Persona;
  /** 棲み分けを裏付ける社内の事実 */
  proof: string[];
  /** あえて来なくていい人 */
  excluded: string;
  /** なぜこの土俵なら一番になれるのか */
  whyWin: string;
  /** 競合の求人との差 */
  competitorGap: string;
}

export interface JobTitleProposal {
  recommended: string;
  alternatives: string[];
  /** 原稿に自然に埋め込むべき検索キーワード */
  searchKeywords: string[];
  note: string;
}

export type CatchphraseType =
  | "情景型"
  | "逆説型"
  | "引用型"
  | "数字型"
  | "呼びかけ型";

export interface Catchphrase {
  type: CatchphraseType;
  copy: string;
  chars: number;
  why: string;
  /** どこで使うか */
  useIn: string;
}

export interface ShotDirection {
  no: number;
  title: string;
  whatToShoot: string;
  why: string;
}

export interface VisualPlan {
  concept: string;
  mainShot: {
    scene: string;
    subject: string;
    composition: string;
    lighting: string;
    mood: string;
  };
  shotList: ShotDirection[];
  ngShots: string[];
  /** AI画像生成用プロンプト(英語) */
  imagePrompt: string;
  /** 画像に重ねる短いコピー */
  textOnImage: string;
}

export interface AppealPoint {
  label: string;
  detail: string;
}

export interface TimelineItem {
  time: string;
  what: string;
}

export interface SelectionStep {
  step: string;
  what: string;
  duration: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface JobPost {
  title: string;
  /** 冒頭のつかみ */
  lead: string;
  /** 「仕事内容」欄にそのまま貼れる本文 */
  body: string;
  appealPoints: AppealPoint[];
  /** 1日の流れ */
  timeline: TimelineItem[];
  requirements: { must: string[]; welcome: string[]; noNeed: string[] };
  conditions: {
    employmentType: string;
    salary: string;
    salaryNote: string;
    hours: string;
    holidays: string;
    workplace: string;
    access: string;
    benefits: string[];
    trialPeriod: string;
  };
  selectionFlow: SelectionStep[];
  faq: Faq[];
  closing: string;
}

export interface AbTest {
  name: string;
  hypothesis: string;
  whatToChange: string;
  howToJudge: string;
}

export interface Kpi {
  metric: string;
  target: string;
  note: string;
}

export interface Operations {
  kpi: Kpi[];
  budgetAdvice: string;
  abTests: AbTest[];
  postingTips: string[];
  /** 応募時に聞くべき質問(棲み分けをフィルタとして働かせる) */
  screeningQuestions: string[];
}

export interface IndeedProposal {
  summary: ProposalSummary;
  diagnosis: Diagnosis;
  positioning: Positioning;
  jobTitle: JobTitleProposal;
  catchphrases: Catchphrase[];
  visual: VisualPlan;
  jobPost: JobPost;
  operations: Operations;
  /** 原稿の法令・表現チェック結果 */
  cautions: string[];
}

export interface IndeedRequest {
  hearing: HearingSheet;
  /** 参考写真 (dataURL, 最大3枚)。職場の空気感をAIが視覚分析する */
  images?: string[];
}
