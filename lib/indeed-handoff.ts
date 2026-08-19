// 営業コンソール(フォーム営業のターゲットリスト)から、提案スタジオへの引き継ぎ。
//
// 引き継げるのは「外から見える事実」だけ。棲み分けの設計に不可欠な
// 「活躍している人の特徴」「エピソード」は商談で聞くしかないため、
// 何が埋まって何が空のままかを呼び出し側に返す。

import type { HearingSheet } from "@/lib/indeed-types";

/** 営業コンソールが書き出す引き継ぎデータ (v1) */
export interface Handoff {
  v: 1;
  src: "form-sales-console";
  id?: string;
  company: string;
  industry?: string;
  segment?: string;
  roles?: string;
  prefectures?: string;
  areas?: string;
  postings?: string;
  sites?: string;
  yearRound?: string;
  firstSeen?: string;
  lastSeen?: string;
  days?: string;
  spend?: string;
  priority?: string;
  hp?: string;
  jobSample?: string;
  caution?: string;
}

/* ---------- URLセーフな base64 でのやり取り ---------- */

export function encodeHandoff(h: Handoff): string {
  const bytes = new TextEncoder().encode(JSON.stringify(h));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeHandoff(token: string): Handoff | null {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (parsed?.src !== "form-sales-console" || typeof parsed.company !== "string") {
      return null;
    }
    return parsed as Handoff;
  } catch {
    return null;
  }
}

/**
 * 貼り付けられた文字列から引き継ぎデータを取り出す。
 * 引き継ぎURL全体でも、トークン単体でも、生のJSONでも受け付ける。
 */
export function parseHandoffInput(raw: string): Handoff | null {
  const text = raw.trim();
  if (!text) return null;

  // 1. URL に handoff クエリが付いている
  const fromQuery = /[?&]handoff=([A-Za-z0-9_-]+)/.exec(text);
  if (fromQuery) return decodeHandoff(fromQuery[1]);

  // 2. 生のJSON
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (parsed?.src === "form-sales-console" && typeof parsed.company === "string") {
        return parsed as Handoff;
      }
    } catch {
      return null;
    }
    return null;
  }

  // 3. トークン単体
  if (/^[A-Za-z0-9_-]+$/.test(text)) return decodeHandoff(text);
  return null;
}

/* ---------- ヒアリングシートへの反映 ---------- */

export interface HandoffResult {
  /** 引き継ぎで埋まった項目 */
  patch: Partial<HearingSheet>;
  /** 埋まった項目のラベル(画面表示用) */
  filled: string[];
  /** 引き継げないのでヒアリングが必要な項目 */
  toAsk: string[];
}

export function applyHandoff(h: Handoff): HandoffResult {
  const patch: Partial<HearingSheet> = {};
  const filled: string[] = [];

  const add = <K extends keyof HearingSheet>(
    key: K,
    value: HearingSheet[K] | "",
    label: string
  ) => {
    if (typeof value === "string" && !value.trim()) return;
    patch[key] = value as HearingSheet[K];
    filled.push(label);
  };

  add("companyName", h.company, "企業名");

  if (h.hp?.trim()) add("url", h.hp.trim(), "企業HP");

  const businessLines = [
    h.industry && `業種: ${h.industry}`,
    h.segment && `区分: ${h.segment}`,
    h.sites && `拠点数: ${h.sites}`,
    "(事業内容の詳細は商談で確認して上書きしてください)",
  ].filter(Boolean);
  if (businessLines.length > 1) {
    add("business", businessLines.join("\n"), "事業内容(業種・区分のみ)");
  }

  if (h.roles?.trim()) add("position", h.roles.trim(), "募集職種(業種からの推定)");

  const workplace = [h.prefectures, h.areas].filter(Boolean).join(" / ");
  if (workplace) add("workplace", workplace, "勤務地・エリア");

  if (h.spend?.trim()) {
    add("budget", `推定出稿額 ${h.spend.trim()}(Indeedの掲載状況からの推定値)`, "予算(推定)");
  }

  const observed = [
    "【Indeed掲載状況 — 営業リストの観測データ】",
    h.postings && `掲載件数: ${h.postings}件`,
    h.sites && `拠点数: ${h.sites}`,
    h.prefectures && `都道府県: ${h.prefectures}`,
    h.areas && `主要エリア: ${h.areas}`,
    h.yearRound && `通年採用: ${h.yearRound}`,
    h.firstSeen && h.lastSeen && `掲載期間: ${h.firstSeen} 〜 ${h.lastSeen}(${h.days ?? "?"}日)`,
    h.jobSample && `求人サンプル: ${h.jobSample}`,
    h.caution && `注意: ${h.caution}`,
  ].filter(Boolean);
  if (observed.length > 1) {
    add("memo", observed.join("\n"), "Indeed掲載状況");
  }

  return {
    patch,
    filled,
    toAsk: [
      "★実際に活躍している人の特徴",
      "★活躍している人の具体的なエピソード",
      "すぐ辞めた人・合わなかった人の特徴",
      "職場の雰囲気",
      "雇用形態(上部で選択)",
      "給与・勤務時間・休日などの条件",
    ],
  };
}
