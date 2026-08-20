// ⑦ 実績の記録と、次の打ち手の判定。
//
// このツールの目的は「記事を作ること」ではなく「月商目標に届くこと」。
// 出しっぱなしにせず、数字を入れて次を決める場所を必ず通るようにしている。

import { NextResponse } from "next/server";
import { failure, guard, isResponse, readJson } from "@/lib/api";
import { generateJson } from "@/lib/claude";
import { BASE_SYSTEM, nextMovePrompt } from "@/lib/prompts";
import { NEXT_MOVE_SCHEMA } from "@/lib/schemas";
import { saveProject } from "@/lib/store";
import type { MetricEntry, NextMove } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;

/** 実績を1件足す */
export async function PUT(request: Request) {
  const body = await readJson<{
    projectId?: string;
    entry?: Partial<MetricEntry>;
  }>(request);
  if (!body) return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });

  const g = await guard(body.projectId);
  if (isResponse(g)) return g;

  const e = body.entry ?? {};
  const articleId =
    typeof e.articleId === "string" && g.project.articles.some((a) => a.id === e.articleId)
      ? e.articleId
      : null;

  const entry: MetricEntry = {
    id: crypto.randomUUID(),
    recordedAt: new Date().toISOString(),
    articleId,
    views: numOrNull(e.views),
    likes: numOrNull(e.likes),
    sales: numOrNull(e.sales),
    revenueYen: numOrNull(e.revenueYen),
    netYen: numOrNull(e.netYen),
    followers: numOrNull(e.followers),
    members: numOrNull(e.members),
    memo: typeof e.memo === "string" ? e.memo.slice(0, 500) : "",
  };

  const hasAny =
    entry.views !== null ||
    entry.likes !== null ||
    entry.sales !== null ||
    entry.revenueYen !== null ||
    entry.netYen !== null ||
    entry.followers !== null ||
    entry.members !== null;
  if (!hasAny) {
    return NextResponse.json({ error: "数字を1つ以上入れてください。" }, { status: 400 });
  }

  g.project.metrics.push(entry);
  // 記録が増え続けても困らないよう、古いものから落とす
  if (g.project.metrics.length > 2000) {
    g.project.metrics = g.project.metrics.slice(-2000);
  }
  return NextResponse.json({ project: await saveProject(g.project, g.user.name) });
}

export async function DELETE(request: Request) {
  const body = await readJson<{ projectId?: string; entryId?: string }>(request);
  if (!body) return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });

  const g = await guard(body.projectId);
  if (isResponse(g)) return g;

  const before = g.project.metrics.length;
  g.project.metrics = g.project.metrics.filter((m) => m.id !== body.entryId);
  if (g.project.metrics.length === before) {
    return NextResponse.json({ error: "記録が見つかりません。" }, { status: 404 });
  }
  return NextResponse.json({ project: await saveProject(g.project, g.user.name) });
}

/** 実績を読んで次の打ち手を出す */
export async function POST(request: Request) {
  const body = await readJson<{ projectId?: string }>(request);
  if (!body) return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });

  const g = await guard(body.projectId);
  if (isResponse(g)) return g;

  if (g.project.metrics.length === 0) {
    return NextResponse.json(
      { error: "まだ実績の記録がありません。閲覧数や売上を1件入れてからお試しください。" },
      { status: 400 }
    );
  }

  try {
    const result = await generateJson<Omit<NextMove, "judgedAt">>({
      system: BASE_SYSTEM,
      prompt: nextMovePrompt({
        profile: g.project.profile,
        plan: g.project.plan,
        articles: g.project.articles,
        metrics: g.project.metrics,
      }),
      schema: NEXT_MOVE_SCHEMA,
      maxTokens: 10000,
    });

    g.project.nextMove = { ...result, judgedAt: new Date().toISOString() };
    return NextResponse.json({ project: await saveProject(g.project, g.user.name) });
  } catch (e) {
    return failure(e);
  }
}
