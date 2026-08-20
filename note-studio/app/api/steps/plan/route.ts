// ⑤ 運用計画。90 日で月商目標に向かう道筋。

import { NextResponse } from "next/server";
import { failure, guard, isResponse, missingStep, readJson } from "@/lib/api";
import { generateJson } from "@/lib/claude";
import { BASE_SYSTEM, planPrompt } from "@/lib/prompts";
import { PLAN_SCHEMA } from "@/lib/schemas";
import { saveProject } from "@/lib/store";
import type { OperationPlan } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

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
      maxTokens: 20000,
    });

    // 算数はAIに任せきりにしない。合計が目標に届いているかをサーバー側でも確かめ、
    // ずれていたら画面に警告を出す(数字が合わない計画で動くと目標に届かないため)
    const sum = result.revenueMath.breakdown.reduce((n, b) => n + (b.subtotalYen ?? 0), 0);
    const goal = result.revenueMath.goalYen || g.project.profile.monthlyGoalYen;
    const warnings: string[] = [];
    if (sum < goal) {
      warnings.push(
        `内訳の合計が ${sum.toLocaleString()} 円で、目標の ${goal.toLocaleString()} 円に届いていません。価格か本数を見直してください。`
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
