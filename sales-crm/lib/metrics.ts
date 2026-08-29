// 運用実績の計算と表示。
//
// 「応募単価 = 出稿費 ÷ 応募数」のような数字は保存しない。保存すると、
// もとの数字を直したときに計算し直すのを忘れ、画面ごとに違う値が出る。
// 必要になったところで、そのつど割り算する。

import type { Metric, MetricValue } from "./types";

/** 指標の値を引くための入れ物。媒体 x 指標 で引ける */
export class MetricTable {
  private map = new Map<string, number>();

  constructor(values: MetricValue[] = []) {
    for (const v of values) this.set(v.channelId, v.metricId, v.value);
  }

  private key(channelId: string, metricId: string) {
    return `${channelId} ${metricId}`;
  }

  set(channelId: string, metricId: string, value: number) {
    this.map.set(this.key(channelId, metricId), value);
  }

  /** 入力された生の値。入っていなければ 0 */
  raw(channelId: string, metricId: string): number {
    return this.map.get(this.key(channelId, metricId)) ?? 0;
  }

  /** その指標を、全媒体ぶん足したもの */
  rawTotal(metricId: string): number {
    let sum = 0;
    for (const [k, v] of this.map) {
      if (k.endsWith(` ${metricId}`)) sum += v;
    }
    return sum;
  }

  /**
   * 表示用の値。割り算で出す指標はここで計算する。
   * 割る数が 0 のときは null（「—」と出す。0 と書くと嘘になる）
   */
  value(metric: Metric, channelId: string | null): number | null {
    const get = (id: string) => (channelId ? this.raw(channelId, id) : this.rawTotal(id));
    if (metric.kind !== "ratio") return get(metric.id);
    if (!metric.numeratorId || !metric.denominatorId) return null;
    const den = get(metric.denominatorId);
    if (!den) return null;
    const ratio = get(metric.numeratorId) / den;
    return metric.format === "percent" ? ratio * 100 : ratio;
  }
}

export function formatMetric(value: number | null, metric: Metric): string {
  if (value === null) return "—";
  if (metric.format === "money") {
    return `￥${Math.round(value).toLocaleString("ja-JP")}`;
  }
  if (metric.format === "percent") {
    return `${(Math.round(value * 10) / 10).toLocaleString("ja-JP")}%`;
  }
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString("ja-JP")}${metric.unit ? ` ${metric.unit}` : ""}`;
}

/** 前の月からの増減(%)。良し悪しは指標によって逆になるので、向きだけ返す */
export function delta(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before === 0) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

/**
 * 単価は下がったほうがよく、応募数は増えたほうがよい。
 * 名前で判断せず、金額の割り算(単価)だけ「下がると良い」とみなす。
 */
export function lowerIsBetter(metric: Metric): boolean {
  return metric.kind === "ratio" && metric.format === "money";
}
