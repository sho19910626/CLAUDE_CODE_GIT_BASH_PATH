// 目標を「手取り」で扱うための計算。
//
// note の売上は、そのまま手元に入らない。
//   売上 → 決済手数料を引く → 残りに note のプラットフォーム利用料を引く → 振込手数料を引く
// だから「月10万円ほしい」なら、売上は12万円ほど必要になる。
//
// ここを曖昧にしたまま計画を立てると、計画どおりに売れても目標に届かない。
// このツールは目標を必ず【手取り】で持ち、必要な売上を逆算する。
//
// ⚠ 手数料率は変わりうる。ここの数字は概算として扱い、
//   画面でも「最新は note の公式ヘルプで確認」と添えている。
//   率が変わったら FEES の定数だけ直せばよい。

export const FEES = {
  /** 決済手数料。決済手段で変わるため、構成比で加重平均する */
  payment: {
    /** クレジットカード決済 */
    card: 0.05,
    /** 携帯キャリア決済(いちばん高い) */
    carrier: 0.15,
  },
  /** 決済手数料を引いた残りにかかる、note のプラットフォーム利用料 */
  platform: 0.1,
  /** 振込 1 回あたり */
  transferYen: 260,
  /**
   * 決済手段の構成比。実績が出るまでは分からないので、
   * 安全側(手数料が高めに出る側)に倒した既定値を置いている。
   * 実際にカード決済ばかりなら、手取りは想定より多くなる。
   */
  carrierShare: 0.3,
} as const;

/** 売上 1 円あたり、手元に残る割合 */
export function netRate(carrierShare = FEES.carrierShare): number {
  const payment =
    FEES.payment.card * (1 - carrierShare) + FEES.payment.carrier * carrierShare;
  return (1 - payment) * (1 - FEES.platform);
}

/** 手取りで◯円ほしいとき、売上はいくら必要か */
export function grossNeededFor(netYen: number): number {
  if (netYen <= 0) return 0;
  return Math.ceil((netYen + FEES.transferYen) / netRate() / 100) * 100;
}

/** 売上◯円のとき、手取りはいくらか */
export function netFromGross(grossYen: number): number {
  if (grossYen <= 0) return 0;
  return Math.max(Math.round(grossYen * netRate() - FEES.transferYen), 0);
}

/** 手数料の内訳を、画面に出せる形で返す */
export function feeBreakdown(netGoalYen: number) {
  const gross = grossNeededFor(netGoalYen);
  const payment =
    FEES.payment.card * (1 - FEES.carrierShare) + FEES.payment.carrier * FEES.carrierShare;
  const paymentFee = Math.round(gross * payment);
  const platformFee = Math.round((gross - paymentFee) * FEES.platform);
  return {
    grossYen: gross,
    paymentFeeYen: paymentFee,
    platformFeeYen: platformFee,
    transferFeeYen: FEES.transferYen,
    netYen: gross - paymentFee - platformFee - FEES.transferYen,
    netRatePercent: Math.round(netRate() * 1000) / 10,
  };
}

// ===== 目標の段階 =====
//
// 目標の額で、取るべき手段が変わる。
// 手取り10万円は単品の有料記事だけでも届くが、50万円は届かない。
// 「同じやり方で本数を増やせば届く」と考えると、必ずどこかで頭打ちになる。

export type GoalTier = "start" | "grow" | "scale" | "business";

export interface GoalPreset {
  tier: GoalTier;
  netYen: number;
  label: string;
  /** その額に届くための現実的な形 */
  shape: string;
}

export const GOAL_PRESETS: GoalPreset[] = [
  {
    tier: "start",
    netYen: 100000,
    label: "手取り 月10万円",
    shape: "単品の有料記事が中心で届く。1,000〜3,000円を月20〜40本ぶん売る形。",
  },
  {
    tier: "grow",
    netYen: 150000,
    label: "手取り 月15万円",
    shape:
      "単品だけだと本数がきつくなる。メンバーシップで土台の固定収入を作り、単品を上に乗せる形。",
  },
  {
    tier: "scale",
    netYen: 300000,
    label: "手取り 月30万円",
    shape:
      "単品の量産では届かない。メンバーシップの会員数か、5,000円以上の高単価商品が要る。読者を集める導線(X など note の外)が前提になる。",
  },
  {
    tier: "business",
    netYen: 500000,
    label: "手取り 月50万円",
    shape:
      "note 単体ではほぼ届かない。note を入口にして、本業の仕事や講座など単価の高いものに繋ぐ形が現実的。note の売上は全体の一部になる。",
  },
];

export function tierFor(netYen: number): GoalPreset {
  // 目標に一番近い段階を返す(プリセット以外の額を入れても判定できる)
  let best = GOAL_PRESETS[0];
  for (const p of GOAL_PRESETS) {
    if (netYen >= p.netYen) best = p;
  }
  return best;
}

/** 目標の段階ごとに、AI へ渡す設計の指針 */
export function tierGuidance(netYen: number): string {
  const t = tierFor(netYen);
  const gross = grossNeededFor(netYen);

  const common = `目標は【手取り】月 ${netYen.toLocaleString()} 円です。
手数料でおよそ ${100 - Math.round(netRate() * 100)}% 引かれるため、
**売上ではおよそ ${gross.toLocaleString()} 円**が必要です。
逆算はこの売上の額で行い、内訳の合計はこの額以上にしてください。`;

  const perTier: Record<GoalTier, string> = {
    start: `この規模は、単品の有料記事の積み上げで届きます。
1本あたりの単価を無理に上げるより、買われる型を1つ見つけて本数を重ねるほうが早いです。
ただし「毎月新しく売れ続ける」前提は置かないでください。
過去記事が売れ続ける状態(ストック)を作ることを計画に含めてください。`,

    grow: `この規模から、単品だけだと必要な本数が現実的でなくなります。
毎月ゼロから積み上げるのをやめ、**固定収入の土台**を作ってください。
メンバーシップを使う場合は、会員数 × 月額でこの額の 4〜6 割を賄い、
残りを単品の有料記事で埋める形にしてください。
単品とメンバーシップの線引き(何を分けるか)を曖昧にすると、どちらも売れなくなります。`,

    scale: `この規模は、記事を増やすだけでは届きません。次のどれかが必ず要ります。
  - メンバーシップの会員数(数百人規模。集めるには note の外からの流入が必須)
  - 5,000円以上の高単価商品(テンプレート、教材、まとめ売り)
  - 上の組み合わせ
計画には **note の外から読者を連れてくる導線**(X などでの発信)を必ず入れてください。
note の中だけで完結する計画を書かないでください。この規模では届きません。
また、この額を1人で回すには時間が足りない可能性があります。
使える時間で無理なら、正直に「この時間では届かない」と書き、
何時間必要か、あるいは目標を下げるべきかを示してください。`,

    business: `この規模は、note の記事販売だけではほぼ届きません。
それを正直に伝えたうえで、現実的な形を設計してください。
  - note は入口にする。信用を作り、単価の高い仕事(本業・講座・コンサル)に繋ぐ
  - note 単体の売上は、目標全体の一部として位置づける
  - 内訳には、note の売上と、note 経由で発生する外の売上を分けて書く
「有料記事を大量に書けば届く」という計画は書かないでください。それは実現しません。
使える時間でこの額が無理なら、無理だと明記し、到達に必要な条件を示してください。`,
  };

  return `${common}\n\n${perTier[t.tier]}`;
}

// ===== 実績から手取りを出す =====

/**
 * 直近 31 日の手取りを出す。
 *
 * 手取りの実額(netYen)が入っていればそれを使い、
 * 売上(revenueYen)しか無ければ手数料を引いた概算を使う。
 * 実額のほうが常に正しいので優先する。
 */
export function monthlyNetFrom(
  metrics: { recordedAt: string; revenueYen: number | null; netYen: number | null }[],
  days = 31
): { netYen: number; estimated: boolean } {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  let net = 0;
  let estimated = false;

  for (const m of metrics) {
    if (Date.parse(m.recordedAt) < since) continue;
    if (m.netYen !== null) {
      net += m.netYen;
    } else if (m.revenueYen !== null) {
      net += netFromGross(m.revenueYen);
      estimated = true;
    }
  }
  return { netYen: Math.round(net), estimated };
}
