// 統計ユーティリティ。
//
// 求人媒体の数値は「表示 300 回でクリック 9 回」のように母数が小さいことが多く、
// 素の割り算だけで良し悪しを判断すると、ただのブレを課題として提案してしまう。
// ここでは次の 2 つでそれを防いでいる:
//   1) Wilson 信頼区間 — その求人の CTR/応募率が「本当に低い」と言い切れるかを判定する
//   2) 経験ベイズ収縮 — データの少ないセグメントのベンチマークを上位階層に寄せる

/** 割合。分母 0 のときは 0 を返す */
export function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Wilson score interval。
 * 二項割合の信頼区間として、母数が小さいときも破綻しない標準的な手法。
 * @param successes クリック数(または応募数)
 * @param trials 表示数(またはクリック数)
 * @param z 1.96 = 95%、1.28 = 80%
 */
export function wilsonInterval(
  successes: number,
  trials: number,
  z = 1.96
): { low: number; high: number } {
  if (trials <= 0) return { low: 0, high: 1 };
  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const center = p + z2 / (2 * trials);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);
  return {
    low: Math.max(0, (center - margin) / denom),
    high: Math.min(1, (center + margin) / denom),
  };
}

/**
 * ベータ二項分布の経験ベイズ収縮。
 * 上位階層の割合 prior を「疑似観測 strength 回ぶんの事前情報」として混ぜる。
 * データが増えるほど prior の影響は自動的に薄まり、実測値に収束する。
 *
 * @param successes 実測の成功数
 * @param trials 実測の試行数
 * @param prior 上位階層の割合(業種平均や全体平均、最終的にはシード値)
 * @param strength 事前情報の強さ(試行回数に換算した値)
 */
export function shrink(
  successes: number,
  trials: number,
  prior: number,
  strength: number
): number {
  const alpha = prior * strength;
  const beta = (1 - prior) * strength;
  return (successes + alpha) / (trials + alpha + beta);
}

/**
 * 収縮によって実測値がどれだけ効いているか (0〜1)。
 * 0 = 完全に事前情報 (シード値)、1 = 完全に実測値。画面の「学習の進み具合」に使う。
 */
export function shrinkConfidence(trials: number, strength: number): number {
  if (trials <= 0) return 0;
  return trials / (trials + strength);
}

/** 線形補間パーセンタイル。values は昇順である必要はない */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** 中央値 */
export function median(values: number[]): number {
  return percentile(values, 0.5);
}

/** 重み付き平均。重みの合計が 0 なら fallback を返す */
export function weightedMean(
  items: { value: number; weight: number }[],
  fallback = 0
): number {
  let sum = 0;
  let w = 0;
  for (const it of items) {
    if (!Number.isFinite(it.value) || it.weight <= 0) continue;
    sum += it.value * it.weight;
    w += it.weight;
  }
  return w > 0 ? sum / w : fallback;
}

/**
 * 2 つの割合が統計的に違うと言えるか(2 標本 z 検定、両側 5%)。
 * 施策の前後比較で「改善したと言い切れるか」の判定に使う。
 */
export function proportionsDiffer(
  s1: number,
  n1: number,
  s2: number,
  n2: number
): boolean {
  if (n1 < 1 || n2 < 1) return false;
  const p1 = s1 / n1;
  const p2 = s2 / n2;
  const pooled = (s1 + s2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return false;
  return Math.abs(p1 - p2) / se > 1.96;
}

/** 日数(両端を含む)。不正な日付は 1 を返す */
export function dayCount(start: string, end: string): number {
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 1;
  return Math.max(1, Math.round((e - s) / 86_400_000) + 1);
}

/** 0 除算を避けた相対リフト率。before が 0 なら null */
export function relativeLift(before: number, after: number): number | null {
  if (before <= 0) return null;
  return (after - before) / before;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
