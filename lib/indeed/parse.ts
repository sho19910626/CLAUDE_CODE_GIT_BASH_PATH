// 実績データの取り込み。
//
// Indeed の管理画面やスプレッドシートからコピーした表を、そのまま貼り付けて取り込めるようにする。
// 手入力を挟むと運用が続かず、続かないとこのツールは学習しないため、
// 取り込みの手間を減らすことが精度に直結する。
//
// 対応:
//   - タブ区切り(スプレッドシートからのコピペ)/ カンマ区切り(CSV ダウンロード)
//   - 列名の表記ゆれ(表示数 / インプレッション / Impressions …)
//   - 「1,234」「12.3%」「¥5,000」といった書式付きの数値
//   - CTR・応募率の列は読み込むが、値は表示数・クリック数・応募数から計算し直す(検算に使う)

import type { EmploymentTypeId, IndustryId } from "./types";
import { EMPLOYMENT_TYPES, INDUSTRIES } from "./seed";

export interface ParsedRow {
  /** 元データの行番号(1 始まり、ヘッダーを除く) */
  rowNumber: number;
  jobName: string;
  company?: string;
  impressions: number;
  clicks: number;
  applies: number;
  cost?: number;
  periodStart?: string;
  periodEnd?: string;
  industry?: IndustryId;
  jobCategory?: string;
  employmentType?: EmploymentTypeId;
  prefecture?: string;
  wage?: number;
  /** ファイルに入っていた CTR。計算値と 1 ポイント以上ずれたら警告する */
  reportedCtr?: number;
  reportedApplyRate?: number;
  /** ファイルに入っていたクリック単価・応募単価(そのまま持つ) */
  reportedCpc?: number;
  reportedCpa?: number;
  /** 費用を「クリック単価 × クリック数」から復元したか */
  costDerived?: boolean;
  warnings: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  /** 認識できた列 → 元のヘッダー名 */
  mapping: Record<string, string>;
  errors: string[];
}

/** 列名の候補。左から順に部分一致で判定する */
const COLUMN_ALIASES: Record<string, string[]> = {
  // Indeed の管理画面から落とした CSV をそのまま貼れるように、
  // 実際の出力列名(案件名・コンバージョン数・利用金額…)も受け付ける。
  // 手作りのスプレッドシートで使われがちな言い方も残してある。
  jobName: ["求人名", "案件名", "求人タイトル", "job title", "jobtitle", "タイトル", "求人"],
  company: ["会社名", "企業名", "クライアント", "company"],
  impressions: [
    "表示数", "インプレッション数", "インプレッション", "impression", "表示回数", "表示",
  ],
  clicks: ["クリック数", "クリック", "click"],
  applies: [
    "応募数", "応募開始数", "応募者数", "コンバージョン数", "cv数", "conversion",
    "apply", "application", "応募",
  ],
  cost: [
    "利用金額", "利用額", "費用", "広告費", "消化金額", "cost", "spend", "予算消化", "金額",
  ],
  /** クリック単価。利用金額が無いときは、これ × クリック数 で費用を復元する */
  cpc: ["クリック単価", "平均クリック単価", "cpc"],
  /** 応募単価。読み取った費用との食い違いを警告に出すために使う */
  cpa: ["コンバージョン単価", "応募単価", "cpa"],
  // 毎日 1 行ずつ記録するスプレッドシートを想定し、単一の日付列を最優先で見る
  date: ["日付", "date", "年月日", "計測日", "対象日"],
  periodStart: ["開始日", "期間開始", "from", "集計開始"],
  periodEnd: ["終了日", "期間終了", "to", "集計終了"],
  period: ["期間", "集計期間"],
  industry: ["業種", "業界", "industry"],
  jobCategory: ["職種", "職種名", "category"],
  employmentType: ["雇用形態", "employment"],
  prefecture: ["都道府県", "県", "prefecture", "勤務地"],
  wage: ["時給", "給与", "月給", "日給", "wage", "salary"],
  ctr: ["ctr", "クリック率"],
  applyRate: ["応募率", "cvr", "コンバージョン率"],
};

/** 「1,234」「¥5,000」「12.3%」などを数値にする */
function toNumber(raw: string): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s円¥￥件回%％]/g, "")
    .trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "—") return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/** パーセント表記を割合にする。「3.2%」→ 0.032、「0.032」→ 0.032 */
function toRate(raw: string): number | undefined {
  const hasPercent = /[%％]/.test(raw);
  const n = toNumber(raw);
  if (n === undefined) return undefined;
  if (hasPercent) return n / 100;
  return n > 1 ? n / 100 : n;
}

/** 「2026/04/01」「2026-04-01」「2026年4月1日」を YYYY-MM-DD にする */
export function toIsoDate(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const m = t.match(/(\d{4})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})/);
  if (!m) return undefined;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** 「2026/04/01 - 2026/04/30」のような期間表記を分解する */
function splitPeriod(raw: string): { start?: string; end?: string } {
  const parts = raw.split(/[〜~～\-–—]|から|to/i).filter((p) => p.trim());
  if (parts.length >= 2) {
    return { start: toIsoDate(parts[0]), end: toIsoDate(parts[1]) };
  }
  const single = toIsoDate(raw);
  return { start: single, end: single };
}

function matchIndustry(raw: string): IndustryId | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const exact = INDUSTRIES.find((i) => i.label === t || i.id === t);
  if (exact) return exact.id;
  const partial = INDUSTRIES.find(
    (i) => t.includes(i.label) || i.label.includes(t)
  );
  return partial?.id;
}

function matchEmployment(raw: string): EmploymentTypeId | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const exact = EMPLOYMENT_TYPES.find((e) => e.label === t || e.id === t);
  if (exact) return exact.id;
  if (/(バイト|パート)/.test(t)) return "parttime";
  if (/正社員/.test(t)) return "fulltime";
  if (/契約/.test(t)) return "contract";
  if (/派遣/.test(t)) return "dispatch";
  if (/委託|請負|フリーランス/.test(t)) return "outsourcing";
  return undefined;
}

/** 1 行を区切り文字で分割する(引用符つき CSV に対応) */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectDelimiter(header: string): string {
  const tabs = (header.match(/\t/g) ?? []).length;
  const commas = (header.match(/,/g) ?? []).length;
  return tabs >= commas ? "\t" : ",";
}

/** ヘッダー行から、列インデックスと項目の対応を作る */
function mapColumns(headers: string[]): {
  index: Record<string, number>;
  mapping: Record<string, string>;
} {
  const index: Record<string, number> = {};
  const mapping: Record<string, string> = {};
  const normalized = headers.map((h) =>
    h.toLowerCase().replace(/[\s　()（）]/g, "")
  );

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const a = alias.toLowerCase().replace(/\s/g, "");
      const i = normalized.findIndex((h) => h === a);
      if (i >= 0 && index[field] === undefined) {
        index[field] = i;
        mapping[field] = headers[i];
        break;
      }
    }
    if (index[field] !== undefined) continue;
    // 完全一致で見つからなければ部分一致で探す
    for (const alias of aliases) {
      const a = alias.toLowerCase().replace(/\s/g, "");
      const i = normalized.findIndex((h) => h.includes(a));
      if (i >= 0 && !Object.values(index).includes(i)) {
        index[field] = i;
        mapping[field] = headers[i];
        break;
      }
    }
  }
  return { index, mapping };
}

/** 貼り付けられた表を解析する */
export function parseMetricsTable(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return {
      rows: [],
      mapping: {},
      errors: ["ヘッダー行とデータ行の 2 行以上が必要です。"],
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter);
  const { index, mapping } = mapColumns(headers);
  const errors: string[] = [];

  const required = ["jobName", "impressions", "clicks", "applies"] as const;
  const missing = required.filter((f) => index[f] === undefined);
  if (missing.length > 0) {
    const labels: Record<string, string> = {
      jobName: "求人名",
      impressions: "表示数",
      clicks: "クリック数",
      applies: "応募数",
    };
    errors.push(
      `必須の列が見つかりません: ${missing.map((f) => labels[f]).join(" / ")}。1 行目を見出し行にしてください。`
    );
    return { rows: [], mapping, errors };
  }

  const cell = (cols: string[], field: string): string => {
    const i = index[field];
    return i !== undefined ? (cols[i] ?? "") : "";
  };

  const rows: ParsedRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = splitLine(lines[li], delimiter);
    const jobName = cell(cols, "jobName");
    if (!jobName) continue;

    const warnings: string[] = [];
    const impressions = toNumber(cell(cols, "impressions"));
    const clicks = toNumber(cell(cols, "clicks"));
    const applies = toNumber(cell(cols, "applies"));

    if (impressions === undefined || clicks === undefined || applies === undefined) {
      errors.push(`${li + 1} 行目「${jobName}」: 表示数・クリック数・応募数のいずれかが数値として読み取れませんでした。`);
      continue;
    }
    if (clicks > impressions) {
      warnings.push("クリック数が表示数を上回っています。列の対応を確認してください。");
    }
    if (applies > clicks) {
      warnings.push("応募数がクリック数を上回っています。列の対応を確認してください。");
    }

    // 期間の決め方:
    //   1) 「日付」列があれば、その 1 日ぶんの記録として扱う(日次記録のスプレッドシート)
    //   2) 「開始日」「終了日」が別列にあればそれを使う
    //   3) それも無ければ「期間」列を分解する
    const single = toIsoDate(cell(cols, "date"));
    let periodStart = single ?? toIsoDate(cell(cols, "periodStart"));
    let periodEnd = single ?? toIsoDate(cell(cols, "periodEnd"));
    if (!periodStart || !periodEnd) {
      const p = splitPeriod(cell(cols, "period"));
      periodStart = periodStart ?? p.start;
      periodEnd = periodEnd ?? p.end;
    }

    const reportedCtr = toRate(cell(cols, "ctr"));
    const reportedApplyRate = toRate(cell(cols, "applyRate"));
    const calcCtr = impressions > 0 ? clicks / impressions : 0;
    const calcApplyRate = clicks > 0 ? applies / clicks : 0;

    if (reportedCtr !== undefined && Math.abs(reportedCtr - calcCtr) > 0.01) {
      warnings.push(
        `ファイルの CTR(${(reportedCtr * 100).toFixed(2)}%)と計算値(${(calcCtr * 100).toFixed(2)}%)が一致しません。計算値を採用します。`
      );
    }
    if (
      reportedApplyRate !== undefined &&
      Math.abs(reportedApplyRate - calcApplyRate) > 0.01
    ) {
      warnings.push(
        `ファイルの応募率(${(reportedApplyRate * 100).toFixed(2)}%)と計算値(${(calcApplyRate * 100).toFixed(2)}%)が一致しません。計算値を採用します。`
      );
    }

    // 費用の決め方:
    //   1) 「利用金額」列があればそれを使う
    //   2) 無くても「クリック単価」があれば、単価 × クリック数 で復元する
    //      (Indeed の出力は単価だけで金額列が無い切り口があるため)
    const reportedCpc = toNumber(cell(cols, "cpc"));
    const reportedCpa = toNumber(cell(cols, "cpa"));
    let cost = toNumber(cell(cols, "cost"));
    let costDerived = false;
    if (cost === undefined && reportedCpc !== undefined && clicks > 0) {
      cost = Math.round(reportedCpc * clicks);
      costDerived = true;
    }

    // 復元・読み取った費用が、ファイルの応募単価と食い違っていないか確かめる。
    // 列の対応を取り違えたまま取り込むと、以降の判断がすべてずれるため。
    if (cost !== undefined && reportedCpa !== undefined && applies > 0) {
      const calcCpa = cost / applies;
      const gap = Math.abs(calcCpa - reportedCpa) / Math.max(reportedCpa, 1);
      if (gap > 0.05) {
        warnings.push(
          `ファイルの応募単価(${Math.round(reportedCpa)}円)と、費用÷応募数(${Math.round(
            calcCpa
          )}円)が合いません。列の対応を確認してください。`
        );
      }
    }

    rows.push({
      rowNumber: li,
      jobName,
      company: cell(cols, "company") || undefined,
      impressions,
      clicks,
      applies,
      cost,
      costDerived: costDerived || undefined,
      reportedCpc,
      reportedCpa,
      periodStart,
      periodEnd,
      industry: matchIndustry(cell(cols, "industry")),
      jobCategory: cell(cols, "jobCategory") || undefined,
      employmentType: matchEmployment(cell(cols, "employmentType")),
      prefecture: cell(cols, "prefecture") || undefined,
      wage: toNumber(cell(cols, "wage")),
      reportedCtr,
      reportedApplyRate,
      warnings,
    });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push("データ行が 1 件も読み取れませんでした。");
  }

  return { rows, mapping, errors };
}

/**
 * 貼り付け欄に出すサンプル(日次記録の形)。
 * 毎日 1 行ずつ、求人ごとに記録していく想定。
 */
export const SAMPLE_PASTE = `日付\t企業名\t求人名\t業種\t職種\t雇用形態\t都道府県\t時給\t表示数\tクリック数\t応募数
2026/08/03\t○○物流\t【小牧市】フォークリフト/日勤のみ\t物流・運輸・ドライバー\tフォークリフト\t派遣\t愛知県\t1250\t640\t18\t1
2026/08/04\t○○物流\t【小牧市】フォークリフト/日勤のみ\t物流・運輸・ドライバー\tフォークリフト\t派遣\t愛知県\t1250\t712\t21\t1
2026/08/05\t○○物流\t【小牧市】フォークリフト/日勤のみ\t物流・運輸・ドライバー\tフォークリフト\t派遣\t愛知県\t1250\t688\t19\t0
2026/08/06\t○○物流\t【小牧市】フォークリフト/日勤のみ\t物流・運輸・ドライバー\tフォークリフト\t派遣\t愛知県\t1250\t701\t20\t1
2026/08/07\t○○物流\t【小牧市】フォークリフト/日勤のみ\t物流・運輸・ドライバー\tフォークリフト\t派遣\t愛知県\t1250\t655\t17\t1
2026/08/03\t○○物流\t【春日井市】リフト/土日休み\t物流・運輸・ドライバー\tフォークリフト\t派遣\t愛知県\t1450\t720\t40\t3
2026/08/04\t○○物流\t【春日井市】リフト/土日休み\t物流・運輸・ドライバー\tフォークリフト\t派遣\t愛知県\t1450\t755\t42\t3
2026/08/05\t○○物流\t【春日井市】リフト/土日休み\t物流・運輸・ドライバー\tフォークリフト\t派遣\t愛知県\t1450\t690\t38\t2
2026/08/03\t△△ケア\t介護スタッフ(夜勤なし)\t介護・福祉\t介護スタッフ\tアルバイト・パート\t大阪府\t1200\t310\t9\t0
2026/08/04\t△△ケア\t介護スタッフ(夜勤なし)\t介護・福祉\t介護スタッフ\tアルバイト・パート\t大阪府\t1200\t298\t8\t1`;
