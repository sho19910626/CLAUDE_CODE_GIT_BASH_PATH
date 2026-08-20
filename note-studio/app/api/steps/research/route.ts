// ② 競合リサーチ。note の公開データを取ってきて集計し、AI に読ませる。
//
// 取得が全部失敗したときは、AI を呼ばずに止める。
// 空のデータで分析させると、それらしい作り話が返ってくるため。

import { NextResponse } from "next/server";
import { failure, guard, isResponse, readJson } from "@/lib/api";
import { generateJson } from "@/lib/claude";
import { BASE_SYSTEM, researchPrompt } from "@/lib/prompts";
import { RESEARCH_ANALYSIS_SCHEMA } from "@/lib/schemas";
import { runResearch } from "@/lib/research";
import { saveProject } from "@/lib/store";
import type { ResearchAnalysis, ResearchResult } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function POST(request: Request) {
  const body = await readJson<{ projectId?: string; keywords?: string[] }>(request);
  if (!body) return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });

  const g = await guard(body.projectId);
  if (isResponse(g)) return g;

  const keywords = (body.keywords ?? [])
    .map((k) => String(k).trim())
    .filter((k) => k.length > 0 && k.length <= 60)
    .slice(0, 6);

  if (keywords.length === 0) {
    return NextResponse.json(
      { error: "調べるキーワードを1つ以上入れてください。" },
      { status: 400 }
    );
  }

  try {
    const raw = await runResearch(keywords, { deepenTopCreators: 3 });

    const collected = raw.stats.reduce((n, s) => n + s.sampleSize, 0);
    if (collected === 0) {
      return NextResponse.json(
        {
          error:
            "note から記事を1本も取得できませんでした。キーワードを変えるか、しばらく待ってからお試しください。「note との接続を確認」で、いま何が返っているかを見られます。",
          fetchLogs: raw.logs,
        },
        { status: 502 }
      );
    }

    const analysis = await generateJson<ResearchAnalysis>({
      system: BASE_SYSTEM,
      prompt: researchPrompt(g.project.profile, raw),
      schema: RESEARCH_ANALYSIS_SCHEMA,
      maxTokens: 12000,
    });

    const research: ResearchResult = {
      ranAt: new Date().toISOString(),
      keywords,
      stats: raw.stats,
      competitors: raw.competitors,
      analysis,
      fetchLogs: raw.logs,
    };

    // リサーチをやり直したら、その先の工程は前提が変わる。
    // 消しはしないが、画面で「作り直しが要る」と分かるように印を残す。
    g.project.research = research;
    const project = await saveProject(g.project, g.user.name);

    return NextResponse.json({
      project,
      collected,
      fetchCount: raw.fetchCount,
      staleAfter: Boolean(project.genre || project.account || project.plan),
    });
  } catch (e) {
    return failure(e);
  }
}
