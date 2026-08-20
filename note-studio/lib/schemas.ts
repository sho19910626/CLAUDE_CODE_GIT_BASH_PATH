// AI に返させる JSON の形。lib/types.ts と 1 対 1 で対応させる。
// ここがずれると画面側で undefined を触って落ちるので、型を変えたら必ず両方直す。

import { arr, B, enumOf, N, obj, S } from "./claude";

// ===== ② 競合リサーチの分析 =====

export const RESEARCH_ANALYSIS_SCHEMA = obj({
  marketSummary: S,
  winningPatterns: arr(
    obj({ pattern: S, evidence: S, howToUse: S }),
    { min: 3, max: 6 }
  ),
  priceGuidance: obj({ range: S, reason: S, recommendedStart: N }),
  gaps: arr(obj({ gap: S, why: S, difficulty: enumOf("低", "中", "高") }), {
    min: 2,
    max: 6,
  }),
  avoid: arr(obj({ topic: S, reason: S }), { min: 1, max: 5 }),
  entryDifficulty: obj({ level: enumOf("低", "中", "高"), reason: S }),
  caveats: arr(S, { max: 6 }),
});

// ===== ③ ジャンル選定 =====

export const GENRE_SCHEMA = obj({
  candidates: arr(
    obj({
      name: S,
      positioning: S,
      scores: obj({ demand: N, uniqueness: N, sustainability: N, monetization: N }),
      total: N,
      rationale: S,
      risk: S,
      pathToGoal: S,
    }),
    { min: 3, max: 5 }
  ),
  recommended: S,
  reasoning: S,
  firstThemes: arr(S, { min: 3, max: 8 }),
});

// ===== ④ アカウント設計 =====

export const ACCOUNT_SCHEMA = obj({
  creatorName: S,
  urlnameOptions: arr(S, { min: 3, max: 5 }),
  tagline: S,
  profileText: S,
  headerDirection: S,
  iconDirection: S,
  pinnedArticle: obj({ title: S, outline: arr(S, { min: 4, max: 10 }), purpose: S }),
  coreHashtags: arr(S, { min: 5, max: 12 }),
  magazines: arr(obj({ name: S, purpose: S, contents: S }), { min: 2, max: 5 }),
  membership: obj({
    use: B,
    name: S,
    monthlyPriceYen: N,
    benefits: arr(S, { max: 8 }),
    boundary: S,
    targetMembers: N,
  }),
  backendFunnel: obj({ use: B, ctaText: S, placementRule: S }),
});

// ===== ⑤ 運用計画 =====

export const PLAN_SCHEMA = obj({
  revenueMath: obj({
    netGoalYen: N,
    goalYen: N,
    breakdown: arr(
      obj({ source: S, unitYen: N, unitsPerMonth: N, subtotalYen: N }),
      { min: 1, max: 6 }
    ),
    assumptions: arr(S, { min: 2, max: 8 }),
    monthsToGoal: N,
  }),
  phases: arr(
    obj({ label: S, days: S, goal: S, output: S, actions: arr(S, { min: 2, max: 8 }), exitCriteria: S }),
    { min: 3, max: 4 }
  ),
  calendar: arr(
    obj({
      no: N,
      day: N,
      title: S,
      kind: enumOf("free", "paid", "members"),
      priceYen: { type: ["number", "null"] },
      role: S,
      summary: S,
      hashtags: arr(S, { max: 8 }),
    }),
    { min: 12, max: 40 }
  ),
  weeklyRoutine: arr(obj({ day: S, task: S, minutes: N }), { min: 3, max: 10 }),
  recoveryPlaybook: arr(obj({ symptom: S, check: S, action: S }), { min: 3, max: 6 }),
});

// ===== ⑥ 記事 =====

export const ARTICLE_SCHEMA = obj({
  title: S,
  titleOptions: arr(S, { min: 3, max: 5 }),
  lead: S,
  freeBody: S,
  paywallPitch: S,
  paidBody: S,
  cta: S,
  priceYen: { type: ["number", "null"] },
  hashtags: arr(S, { min: 3, max: 10 }),
  visualDirection: S,
  fillIns: arr(obj({ where: S, what: S }), { max: 8 }),
});

// ===== ⑦ 次の打ち手 =====

export const NEXT_MOVE_SCHEMA = obj({
  standing: obj({ currentMonthlyYen: N, goalYen: N, gapYen: N, verdict: S }),
  bottleneck: obj({ stage: S, evidence: S }),
  actions: arr(obj({ priority: N, action: S, why: S, expectedEffect: S }), {
    min: 3,
    max: 7,
  }),
  stopDoing: arr(S, { max: 5 }),
  rewriteTargets: arr(obj({ articleTitle: S, problem: S, fix: S }), { max: 5 }),
});

// ===== リサーチのキーワード提案 =====

export const KEYWORD_SCHEMA = obj({
  keywords: arr(obj({ keyword: S, why: S }), { min: 5, max: 10 }),
});
