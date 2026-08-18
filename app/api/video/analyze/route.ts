// 素材の解析と編集台本の設計。
//
// 文字起こし → 内容分析 → ショート版の構成 → 本編の構成 の順に進める。
// 1回のAIリクエストを短く保つことで、途中で出力が切れるのを避けている。

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ndjsonStream } from "@/lib/ndjson";
import { fetchSiteInfo } from "@/lib/scrape";
import { ANALYSIS_SCHEMA, CUT_PLAN_SCHEMA } from "@/lib/video/edl-schema";
import {
  ANALYSIS_SYSTEM,
  CUT_PLAN_SYSTEM,
  buildAnalysisPrompt,
  buildCutPlanPrompt,
} from "@/lib/video/edl-prompt";
import { normalizeCutPlan, type DraftCutPlan } from "@/lib/video/edl";
import { formatTranscript, transcribeVideo } from "@/lib/video/transcribe";
import { projectFile, projectExists, readProjectJson, writeProjectJson } from "@/lib/video/workspace";
import { projectDir } from "@/lib/video/workspace";
import type { ContentAnalysis, ProjectBrief, VideoProject } from "@/lib/video/edl-types";

export const runtime = "nodejs";
export const maxDuration = 3600;

interface AnalyzeRequest {
  projectId?: string;
  brief?: Partial<ProjectBrief>;
  /** 文字起こしをやり直すか(2回目以降は使い回して時間とAPI費用を節約する) */
  retranscribe?: boolean;
}

type AnalyzeDone = Pick<VideoProject, "analysis" | "short" | "main" | "transcript">;

function emptyBrief(): ProjectBrief {
  return { companyName: "", serviceName: "", url: "", target: "", appeal: "", cta: "", tone: "" };
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "サーバーに ANTHROPIC_API_KEY が設定されていません。.env ファイルを確認してください。" },
      { status: 500 }
    );
  }

  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const projectId = body.projectId ?? "";
  if (!projectId || !(await projectExists(projectId))) {
    return NextResponse.json({ error: "案件が見つかりません。素材をアップロードし直してください。" }, { status: 404 });
  }

  const project = await readProjectJson<VideoProject>(projectId, "project.json");
  if (!project || project.sources.length === 0) {
    return NextResponse.json({ error: "素材がアップロードされていません。" }, { status: 400 });
  }

  const brief: ProjectBrief = { ...emptyBrief(), ...(body.brief ?? {}) };
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5";
  const client = new Anthropic();

  return ndjsonStream<AnalyzeDone>(async (send, signal) => {
    // ── 1. 文字起こし ─────────────────────────────────────────
    const openaiKey = process.env.OPENAI_API_KEY;
    const needsTranscript = body.retranscribe || project.transcript.length === 0;
    const withAudio = project.sources.filter((s) => s.hasAudio);

    if (needsTranscript && openaiKey && withAudio.length > 0) {
      project.transcript = [];
      for (let i = 0; i < withAudio.length; i++) {
        const source = withAudio[i];
        send.progress(
          `音声を文字起こししています (${i + 1}/${withAudio.length}: ${source.fileName})`,
          0.05 + (0.4 * i) / withAudio.length
        );
        const segments = await transcribeVideo(
          projectFile(projectId, source.storedName),
          source.durationSec,
          projectDir(projectId),
          openaiKey,
          { signal }
        );
        project.transcript.push(
          ...segments.map((s) => ({ sourceIndex: source.index, start: s.start, end: s.end, text: s.text }))
        );
      }
      await writeProjectJson(projectId, "project.json", project);
    } else if (!openaiKey && withAudio.length > 0) {
      send.progress("OPENAI_API_KEY が未設定のため、文字起こしを省略します", 0.2);
    }

    const transcriptText = project.sources
      .map((source) => {
        const lines = project.transcript
          .filter((t) => t.sourceIndex === source.index)
          .map((t) => `[${t.start.toFixed(1)}-${t.end.toFixed(1)}] ${t.text}`);
        if (lines.length === 0) return `### 素材${source.index}: ${source.fileName}\n(音声なし・または文字起こしなし)`;
        return `### 素材${source.index}: ${source.fileName}\n${lines.join("\n")}`;
      })
      .join("\n\n");

    // ── 2. 企業サイトの読み込み ───────────────────────────────
    let siteText = "";
    if (brief.url.trim()) {
      send.progress("企業サイトを読み込んでいます", 0.46);
      const site = await fetchSiteInfo(brief.url.trim());
      if (site.ok) {
        siteText = [`URL: ${site.url}`, `タイトル: ${site.title}`, site.description, site.bodyText]
          .filter(Boolean)
          .join("\n");
      }
    }

    // ── 3. 内容の分析 ─────────────────────────────────────────
    send.progress("素材の内容を分析しています", 0.5);
    const analysis = await callClaude<ContentAnalysis>({
      client,
      model,
      system: ANALYSIS_SYSTEM,
      prompt: buildAnalysisPrompt(brief, project.sources, transcriptText, siteText),
      schema: ANALYSIS_SCHEMA,
      maxTokens: 4000,
      signal,
    });
    project.analysis = analysis;
    project.brief = brief;
    await writeProjectJson(projectId, "project.json", project);

    // ── 4. ショート版の構成 ───────────────────────────────────
    send.progress("ショート動画の構成を設計しています", 0.62);
    const shortDraft = await callClaude<DraftCutPlan>({
      client,
      model,
      system: CUT_PLAN_SYSTEM,
      prompt: buildCutPlanPrompt("short", brief, analysis, project.sources, transcriptText),
      schema: CUT_PLAN_SCHEMA,
      maxTokens: 12000,
      signal,
    });
    project.short = normalizeCutPlan("short", shortDraft, project.sources);
    await writeProjectJson(projectId, "project.json", project);

    // ── 5. 本編の構成 ─────────────────────────────────────────
    send.progress("本編(3〜5分)の構成を設計しています", 0.8);
    const mainDraft = await callClaude<DraftCutPlan>({
      client,
      model,
      system: CUT_PLAN_SYSTEM,
      prompt: buildCutPlanPrompt("main", brief, analysis, project.sources, transcriptText),
      schema: CUT_PLAN_SCHEMA,
      maxTokens: 24000,
      signal,
    });
    project.main = normalizeCutPlan("main", mainDraft, project.sources);
    await writeProjectJson(projectId, "project.json", project);

    send.progress("構成ができました", 1);
    send.done({
      analysis: project.analysis,
      short: project.short,
      main: project.main,
      transcript: project.transcript,
    });
  }, req.signal);
}

async function callClaude<T>(args: {
  client: Anthropic;
  model: string;
  system: string;
  prompt: string;
  schema: unknown;
  maxTokens: number;
  signal: AbortSignal;
}): Promise<T> {
  try {
    const response = await args.client.messages.create(
      {
        model: args.model,
        max_tokens: args.maxTokens,
        thinking: { type: "adaptive" },
        system: args.system,
        messages: [{ role: "user", content: args.prompt }],
        output_config: {
          format: { type: "json_schema", schema: args.schema as Record<string, unknown> },
        },
      },
      { signal: args.signal, timeout: 20 * 60 * 1000 }
    );

    if (response.stop_reason === "refusal") {
      throw new Error("この素材では構成を生成できませんでした。素材や入力内容をご確認ください。");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("構成が長すぎて途中で切れました。素材を短くするか、分割してお試しください。");
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("生成結果が空でした。もう一度お試しください。");
    }
    return JSON.parse(textBlock.text) as T;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      throw new Error("APIキーが無効です。ANTHROPIC_API_KEY を確認してください。");
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new Error("APIのレート制限に達しました。しばらく待って再試行してください。");
    }
    if (e instanceof Anthropic.APIError) {
      throw new Error(`AIの生成でエラーが発生しました (${e.status})`);
    }
    throw e;
  }
}
