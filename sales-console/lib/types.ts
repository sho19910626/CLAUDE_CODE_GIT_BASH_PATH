// 画面とサーバーで共通に使う型。
//
// 生成結果は「構造化データ(data)」と「コピペ用の本文(text)」の2つを持つ。
// 本文は data から lib/format.ts が組み立てる。AI に自由に書かせると
// フォーマットの見出しが少しずつ揺れるため、整形はこちら側でやる。

export type StepId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const STEP_IDS: StepId[] = [1, 2, 3, 4, 5, 6, 7];

/** 案件(=1つの商談)。STEP1〜7 はこの下にぶら下がる */
export interface SalesCase {
  id: string;
  /** 商談名。Salesforce の {!Opportunity.Name} に入る値 */
  name: string;
  company: string;
  url: string;
  industry: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaseWithSteps extends SalesCase {
  /** 生成済みの STEP 番号 */
  doneSteps: StepId[];
}

/** 1件の報告 */
export interface Report {
  id: string;
  caseId: string;
  step: StepId;
  /** 商談日時など、その回の日付 */
  meetingAt: string;
  author: string;
  createdAt: string;
  /** コピペ用の本文 */
  text: string;
  /** 想定問答・トークスクリプトなど、コピペ本文とは別に出すもの */
  extraText: string;
  /** 構造化データ(後続STEPへの引き継ぎに使う) */
  data: StepData;
}

/* ===== 生成結果(AI から受け取る構造化データ) ===== */

export interface ActionItem {
  task: string;
  owner: string;
  /** 実際の日付(YYYY-MM-DD)。決められないときは「要相談」 */
  due: string;
  why: string;
}

export interface NextActions {
  recommendation: string;
  customer: ActionItem[];
  us: ActionItem[];
  followUpMail: { subject: string; body: string };
}

/** 議事録に無かった項目と、次回聞くための質問 */
export interface Gap {
  item: string;
  why: string;
  question: string;
}

export interface Common {
  goal: {
    achieved: "達成" | "一部達成" | "未達" | "判断不能";
    assessment: string;
  };
  nextActions: NextActions;
  gaps: Gap[];
  alerts: string[];
}

export interface Step1Prep {
  header: {
    opportunityName: string;
    meetingDateTime: string;
    participants: string;
    purpose: string;
  };
  facts: { research: string[]; hypothesis: string[]; blockers: string[] };
  recommend: {
    models: { name: string; reason: string }[];
    subsidy: string;
    competitorWatch: string;
  };
  mustGet: string[];
  sources: { title: string; url: string; note: string }[];
}

export interface Step1Arms {
  qa: { question: string; answer: string }[];
  script: {
    opening: string;
    discovery: string[];
    proposal: string;
    objections: { concern: string; response: string }[];
    closing: string;
  };
  nextActions: NextActions;
  gaps: Gap[];
  alerts: string[];
}

export interface Step1Data {
  kind: "step1";
  prep: Step1Prep;
  arms: Step1Arms;
  researchNotes: string;
}

/** STEP2〜7 は「見出し付きの項目の集まり」で表せる */
export interface StepReportData extends Common {
  kind: "report";
  step: StepId;
  header: Record<string, string>;
  facts: Record<string, string>;
}

export type StepData = Step1Data | StepReportData;

/* ===== 画面 → サーバーへ渡す入力 ===== */

export interface Step1Input {
  opportunityName: string;
  company: string;
  url: string;
  industry: string;
  meetingDateTime: string;
  participants: string;
  purpose: string;
  notes: string;
}

export interface ReportInput {
  opportunityName: string;
  step: StepId;
  meetingAt: string;
  counterpart: string;
  purpose: string;
  minutes: string;
}

export type GenerateRequest =
  | { mode: "step1"; caseId: string | null; input: Step1Input }
  | { mode: "report"; caseId: string | null; input: ReportInput };

/** 生成中に流すイベント(NDJSON) */
export type StreamEvent =
  | { type: "ping" }
  | { type: "progress"; message: string }
  | { type: "done"; report: Report }
  | { type: "error"; error: string };
