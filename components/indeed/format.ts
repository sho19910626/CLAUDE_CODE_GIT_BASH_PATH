// 画面表示用の書式ヘルパー。

import type { StageVerdict } from "@/lib/indeed/types";

export const pct = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`;
export const num = (v: number) => Math.round(v).toLocaleString();
export const yen = (v: number) => `${Math.round(v).toLocaleString()}円`;

export const VERDICT_LABEL: Record<StageVerdict, string> = {
  good: "良好",
  average: "標準",
  weak: "要改善",
  insufficient: "判定保留",
};

export const VERDICT_CLASS: Record<StageVerdict, string> = {
  good: "v-good",
  average: "v-avg",
  weak: "v-weak",
  insufficient: "v-none",
};

export const EFFORT_LABEL: Record<1 | 2 | 3, string> = {
  1: "すぐできる",
  2: "半日〜1日",
  3: "調整が必要",
};

/** 基準比を「基準の 82%」のように読ませる */
export function ratioLabel(ratio: number): string {
  if (!Number.isFinite(ratio)) return "—";
  return `基準比 ${(ratio * 100).toFixed(0)}%`;
}
