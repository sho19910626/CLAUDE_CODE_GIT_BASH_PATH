// ⑥ 記事の執筆・更新・削除。

import { NextResponse } from "next/server";
import { failure, guard, isResponse, missingStep, readJson } from "@/lib/api";
import { generateJson } from "@/lib/claude";
import { articleStats, buildPasteText, toArticle } from "@/lib/article";
import { BASE_SYSTEM, articlePrompt } from "@/lib/prompts";
import { ARTICLE_SCHEMA } from "@/lib/schemas";
import { saveProject } from "@/lib/store";
import type { Article } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

type GeneratedArticle = Pick<
  Article,
  | "title"
  | "titleOptions"
  | "lead"
  | "freeBody"
  | "paywallPitch"
  | "paidBody"
  | "cta"
  | "priceYen"
  | "hashtags"
  | "visualDirection"
  | "fillIns"
>;

export async function POST(request: Request) {
  const body = await readJson<{
    projectId?: string;
    planNo?: number | null;
    kind?: Article["kind"];
    theme?: string;
    priceYen?: number | null;
    extraNotes?: string;
  }>(request);
  if (!body) return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });

  const g = await guard(body.projectId);
  if (isResponse(g)) return g;

  const missing = missingStep(g.project, ["research", "genre", "account"]);
  if (missing) return NextResponse.json({ error: missing }, { status: 400 });

  const kind: Article["kind"] =
    body.kind === "paid" || body.kind === "members" ? body.kind : "free";

  // 計画の記事を指定されたら、テーマと価格は計画から取る
  const planned =
    typeof body.planNo === "number"
      ? g.project.plan?.calendar.find((c) => c.no === body.planNo) ?? null
      : null;

  const theme = (planned ? `${planned.title}\n${planned.summary}\n役目: ${planned.role}` : (body.theme ?? "")).trim();
  if (!theme) {
    return NextResponse.json({ error: "何について書くかを入れてください。" }, { status: 400 });
  }

  const price =
    kind === "paid"
      ? typeof body.priceYen === "number" && body.priceYen >= 100
        ? Math.min(Math.round(body.priceYen), 10000)
        : (planned?.priceYen ?? g.project.research!.analysis.priceGuidance.recommendedStart)
      : null;

  try {
    const generated = await generateJson<GeneratedArticle>({
      system: BASE_SYSTEM,
      prompt: articlePrompt({
        profile: g.project.profile,
        genre: g.project.genre!,
        account: g.project.account!,
        research: g.project.research!,
        kind,
        theme: theme.slice(0, 3000),
        priceYen: price,
        extraNotes: (body.extraNotes ?? "").slice(0, 2000),
        previousTitles: g.project.articles.map((a) => a.title).slice(-20),
      }),
      schema: ARTICLE_SCHEMA,
      maxTokens: 24000,
    });

    const article = toArticle(
      { ...generated, priceYen: kind === "paid" ? price : null },
      { planNo: planned?.no ?? null, kind }
    );

    // 有料記事なのに無料部分が薄いと、読者は買う判断ができない。
    // 生成し直させるほどではないので、画面に注意として出す。
    const stats = articleStats(article);
    const warnings: string[] = [];
    if (kind === "paid" && stats.freeRatio < 0.35) {
      warnings.push(
        `無料部分が全体の ${Math.round(stats.freeRatio * 100)}% しかありません。買う前の判断材料が足りず、売れにくい形です。`
      );
    }
    if (kind === "paid" && stats.paidChars < 1500) {
      warnings.push(`有料部分が ${stats.paidChars} 文字です。価格に見合うか確認してください。`);
    }
    if (article.fillIns.length > 0) {
      warnings.push(
        `あなたにしか書けない情報が ${article.fillIns.length} か所あります。埋めてから公開してください。`
      );
    }

    g.project.articles.push(article);
    return NextResponse.json({
      project: await saveProject(g.project, g.user.name),
      articleId: article.id,
      warnings,
      stats,
    });
  } catch (e) {
    return failure(e);
  }
}

/** 手直しと、公開したことの記録 */
export async function PATCH(request: Request) {
  const body = await readJson<{
    projectId?: string;
    articleId?: string;
    patch?: Partial<Article>;
  }>(request);
  if (!body) return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });

  const g = await guard(body.projectId);
  if (isResponse(g)) return g;

  const idx = g.project.articles.findIndex((a) => a.id === body.articleId);
  if (idx < 0) return NextResponse.json({ error: "記事が見つかりません。" }, { status: 404 });

  const p = body.patch ?? {};
  const current = g.project.articles[idx];
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

  const next: Article = {
    ...current,
    title: text(p.title, 200) ?? current.title,
    lead: text(p.lead, 4000) ?? current.lead,
    freeBody: text(p.freeBody, 60000) ?? current.freeBody,
    paywallPitch: text(p.paywallPitch, 4000) ?? current.paywallPitch,
    paidBody: text(p.paidBody, 60000) ?? current.paidBody,
    cta: text(p.cta, 4000) ?? current.cta,
    publishedUrl: text(p.publishedUrl, 500) ?? current.publishedUrl,
    published: typeof p.published === "boolean" ? p.published : current.published,
    priceYen:
      typeof p.priceYen === "number" && p.priceYen >= 100
        ? Math.min(Math.round(p.priceYen), 10000)
        : p.priceYen === null
          ? null
          : current.priceYen,
    hashtags: Array.isArray(p.hashtags)
      ? p.hashtags.map((h) => String(h).slice(0, 40)).slice(0, 10)
      : current.hashtags,
    updatedAt: new Date().toISOString(),
  };
  next.pasteText = buildPasteText(next);

  // 公開先URLは note のものだけ受け付ける(画面でリンクとして開くため)
  if (next.publishedUrl && !/^https:\/\/note\.com\//.test(next.publishedUrl)) {
    return NextResponse.json(
      { error: "公開先URLは https://note.com/ で始まるものを入れてください。" },
      { status: 400 }
    );
  }

  g.project.articles[idx] = next;
  return NextResponse.json({ project: await saveProject(g.project, g.user.name) });
}

export async function DELETE(request: Request) {
  const body = await readJson<{ projectId?: string; articleId?: string }>(request);
  if (!body) return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });

  const g = await guard(body.projectId);
  if (isResponse(g)) return g;

  const before = g.project.articles.length;
  g.project.articles = g.project.articles.filter((a) => a.id !== body.articleId);
  if (g.project.articles.length === before) {
    return NextResponse.json({ error: "記事が見つかりません。" }, { status: 404 });
  }
  // 記事に紐づく実績も一緒に消す(残すと次の打ち手の判断がずれる)
  g.project.metrics = g.project.metrics.filter((m) => m.articleId !== body.articleId);

  return NextResponse.json({ project: await saveProject(g.project, g.user.name) });
}
