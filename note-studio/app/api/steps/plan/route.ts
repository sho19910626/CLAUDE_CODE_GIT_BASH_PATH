// ⑤ 運用計画。90 日で月商目標に向かう道筋。

import { NextResponse } from "next/server";
import { failure, guard, isResponse, missingStep, readJson } from "@/lib/api";
import { generateJson } from "@/lib/claude";
import { BASE_SYSTEM, planPrompt } from "@/lib/prompts";
import { PLAN_SCHEMA } from "@/lib/schemas";
import { grossNeededFor } from "@/lib/revenue";
import { saveProject } from "@/lib/store";
import type { OperationPlan } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await readJson<{ projectId?: string }>(request);
  if (!body) return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });

  const g = await guard(body.projectId);
  if (isResponse(g)) return g;

  const missing = missingStep(g.project, ["research", "genre", "account"]);
  if (missing) return NextResponse.json({ error: missing }, { status: 400 });

  try {
    const result = await generateJson<Omit<OperationPlan, "plannedAt">>({
      system: BASE_SYSTEM,
      prompt: planPrompt(g.project.profile, g.project.genre!, g.project.account!, g.project.research!),
      schema: PLAN_SCHEMA,
      // 同上。90日ぶんのカレンダーが入るが 14,000 で収まる
      maxTokens: 14000,
    });

    // 算数はAIに任せきりにしない。目標は【手取り】なので、
    // 必要な【売上】をサーバー側で計算し直し、内訳の合計がそこに届くかを確かめる。
    // ここを AI 任せにすると、手取りの額をそのまま売上として組んでしまい、
    // 計画どおり売れても手数料のぶん目標に届かない計画ができあがる。
    const netGoal = g.project.profile.monthlyGoalYen;
    const grossNeeded = grossNeededFor(netGoal);
    const sum = result.revenueMath.breakdown.reduce((n, b) => n + (b.subtotalYen ?? 0), 0);
    const warnings: string[] = [];

    // AI が返した目標額は信用せず、こちらで確定させる
    result.revenueMath.netGoalYen = netGoal;
    result.revenueMath.goalYen = grossNeeded;

    if (sum < grossNeeded) {
      warnings.push(
        `内訳の合計が売上 ${sum.toLocaleString()} 円で、手取り ${netGoal.toLocaleString()} 円に必要な売上 ${grossNeeded.toLocaleString()} 円に届いていません。価格か本数を見直してください。`
      );
    }
    for (const b of result.revenueMath.breakdown) {
      const expected = b.unitYen * b.unitsPerMonth;
      if (Math.abs(expected - b.subtotalYen) > 1) {
        warnings.push(`「${b.source}」の小計が合いません(${b.unitYen} × ${b.unitsPerMonth} = ${expected})。`);
      }
    }
    const minutes = result.weeklyRoutine.reduce((n, w) => n + (w.minutes ?? 0), 0);
    const budget = g.project.profile.hoursPerWeek * 60;
    if (minutes > budget) {
      warnings.push(
        `週の作業が ${minutes} 分で、使える ${budget} 分を超えています。本数を減らすか、時間の入力を見直してください。`
      );
    }

    g.project.plan = { ...result, plannedAt: new Date().toISOString() };
    return NextResponse.json({ project: await saveProject(g.project, g.user.name), warnings });
  } catch (e) {
    return failure(e);
  }
}
