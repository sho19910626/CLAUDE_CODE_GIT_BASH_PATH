// 議事録 → 報告書の生成。
//
// 2つの入り口がある。
//   mode=step1  … 企業名とHPからネットを調べ、商談準備シートを作る
//   mode=report … 議事録から STEP2〜7 の報告を作る
//
// STEP1 は「調べる」と「まとめる」を分けている。web検索をしながら
// 構造化出力(JSON)まで一度にやらせると、検索結果の引用と JSON 文法が
// 干渉して失敗しやすい。まず日本語で調べさせ、それを材料に整形する。
//
// 応答は NDJSON のストリーム。数分かかるため、進捗と ping を流し続けて
// ブラウザや中継サーバーに接続を切られないようにする。

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getAccounts } from "@/lib/accounts";
import { getCases, historyBlock } from "@/lib/cases";
import { buildReport } from "@/lib/format";
import { loadPlaybook, playbookFor } from "@/lib/playbook";
import {
  buildArmsPrompt,
  buildPrepPrompt,
  buildReportPrompt,
  buildResearchPrompt,
  systemPrompt,
  type PromptContext,
} from "@/lib/prompt";
import { STEP1_ARMS_SCHEMA, STEP1_PREP_SCHEMA, reportSchema } from "@/lib/schema";
import { fetchSiteInfo } from "@/lib/scrape";
import { STEP_DEFS } from "@/lib/steps";
import type {
  GenerateRequest,
  Report,
  Step1Arms,
  Step1Prep,
  StepData,
  StepId,
  StepReportData,
  StreamEvent,
} from "@/lib/types";

export const dynamic = "force-dynamic";
// 1回の生成の上限。リサーチが長引いても収まる範囲
export const maxDuration = 800;

class GenError extends Error {
  constructor(
    message: string,
    readonly status = 502
  ) {
    super(message);
  }
}

function model(): string {
  return process.env.ANTHROPIC_MODEL || "claude-opus-5";
}

function client(): Anthropic {
  return new Anthropic({ timeout: 15 * 60 * 1000, maxRetries: 2 });
}

/** 日本時間の今日(YYYY-MM-DD)。期限の日付を置くときの起点になる */
function todayJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/* ===== AI 呼び出し ===== */

/** web検索を使って日本語で調べさせる。pause_turn が来たら続きを促す */
async function research(system: string, prompt: string): Promise<string> {
  const c = client();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  const chunks: string[] = [];

  for (let round = 0; round < 4; round++) {
    const res = await c.messages
      .stream({
        model: model(),
        max_tokens: 32000,
        thinking: { type: "adaptive" },
        system,
        messages,
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: 14,
            user_location: { type: "approximate", country: "JP", timezone: "Asia/Tokyo" },
          } as unknown as Anthropic.ToolUnion,
        ],
      })
      .finalMessage();

    if (res.stop_reason === "refusal") {
      throw new GenError("リサーチが拒否されました。入力内容を見直してください。", 422);
    }
    for (const block of res.content) {
      if (block.type === "text" && block.text.trim()) chunks.push(block.text);
    }
    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason !== "pause_turn") break;
  }

  const text = chunks.join("\n").trim();
  if (!text) throw new GenError("リサーチの結果が空でした。もう一度お試しください。");
  return text;
}

/** JSON スキーマに沿って生成させる */
async function structured<T>(
  system: string,
  prompt: string,
  schema: Record<string, unknown>,
  label: string
): Promise<T> {
  const res = await client()
    .messages.stream({
      model: model(),
      max_tokens: 24000,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { format: { type: "json_schema", schema } },
    })
    .finalMessage();

  if (res.stop_reason === "refusal") {
    throw new GenError(`${label}の生成が拒否されました。入力内容を見直してください。`, 422);
  }
  if (res.stop_reason === "max_tokens") {
    throw new GenError(
      `${label}が長くなりすぎて途中で切れました。議事録を少し短くして再試行してください。`
    );
  }
  const textBlock = res.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new GenError(`${label}の生成結果が空でした。再試行してください。`);
  }
  try {
    return JSON.parse(textBlock.text) as T;
  } catch {
    throw new GenError(`${label}の生成結果を読み取れませんでした。再試行してください。`);
  }
}

/* ===== 本体 ===== */

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が設定されていません。管理者に連絡してください。" },
      { status: 503 }
    );
  }

  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: StreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      const heartbeat = setInterval(() => send({ type: "ping" }), 10_000);
      try {
        const report = await generate(body, user.name, send);
        send({ type: "done", report });
      } catch (e) {
        send({ type: "error", error: describeError(e) });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

async function generate(
  body: GenerateRequest,
  author: string,
  send: (e: StreamEvent) => void
): Promise<Report> {
  const cases = getCases();
  const step: StepId = body.mode === "step1" ? 1 : body.input.step;
  if (!STEP_DEFS[step]) throw new GenError("STEP の指定が不正です。", 400);

  // 案件を確定する。無ければ作る(以降の STEP がこの案件にぶら下がる)
  let caseId = body.caseId ?? "";
  let existing = caseId ? await cases.getCase(caseId) : null;
  if (!existing) {
    caseId = crypto.randomUUID();
    existing = {
      id: caseId,
      name: body.input.opportunityName.trim() || "(商談名未設定)",
      company: body.mode === "step1" ? body.input.company.trim() : "",
      url: body.mode === "step1" ? body.input.url.trim() : "",
      industry: body.mode === "step1" ? body.input.industry.trim() : "",
      owner: author,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await cases.createCase(existing);
  }

  const past = await cases.listReports(caseId);
  const playbook = await loadPlaybook();
  const ctx: PromptContext = {
    today: todayJst(),
    playbook: playbookFor(playbook, step),
    history: historyBlock(past, step),
  };
  const system = systemPrompt(ctx);

  let data: StepData;
  let meetingAt = "";

  if (body.mode === "step1") {
    const input = body.input;
    meetingAt = input.meetingDateTime;

    send({ type: "progress", message: "企業HPを読み込んでいます…" });
    const site = input.url.trim() ? await fetchSiteInfo(input.url.trim()) : null;
    const siteBlock = site?.ok
      ? `## 企業HPから取得した内容\nURL: ${site.url}\nタイトル: ${site.title}\n説明: ${site.description}\n本文抜粋:\n${site.bodyText}`
      : site
        ? `## 企業HP\nURL: ${site.url}（取得できませんでした: ${site.error}。web検索で補ってください）`
        : "";

    send({ type: "progress", message: "ネット・SNS・求人情報を調べています（1〜3分）…" });
    const notes = await research(system, buildResearchPrompt(input, siteBlock));

    send({ type: "progress", message: "商談準備シートを組み立てています…" });
    const prep = await structured<Step1Prep>(
      system,
      buildPrepPrompt(input, notes, ctx),
      STEP1_PREP_SCHEMA,
      "商談準備シート"
    );

    send({ type: "progress", message: "想定問答とトークスクリプトを作っています…" });
    const arms = await structured<Step1Arms>(
      system,
      buildArmsPrompt(input, notes, JSON.stringify(prep)),
      STEP1_ARMS_SCHEMA,
      "想定問答"
    );

    data = { kind: "step1", prep, arms, researchNotes: notes };
  } else {
    const input = body.input;
    if (!input.minutes.trim()) {
      throw new GenError("議事録が空です。貼り付けてから生成してください。", 400);
    }
    meetingAt = input.meetingAt;

    send({
      type: "progress",
      message: `${STEP_DEFS[step].name}を組み立てています（1〜2分）…`,
    });
    const result = await structured<Omit<StepReportData, "kind" | "step">>(
      system,
      buildReportPrompt({
        step,
        opportunityName: input.opportunityName,
        meetingAt: input.meetingAt,
        counterpart: input.counterpart,
        purpose: input.purpose,
        minutes: input.minutes,
        ctx,
      }),
      reportSchema(step),
      STEP_DEFS[step].name
    );
    data = { ...result, kind: "report", step };
  }

  const report = buildReport({
    id: crypto.randomUUID(),
    caseId,
    step,
    meetingAt,
    author,
    opportunityName: body.input.opportunityName || existing.name,
    data,
  });

  await cases.saveReport(report);
  await cases.touchCase(caseId);
  await getAccounts().log(
    author,
    "報告を生成",
    `${existing.name} / STEP${step}：${STEP_DEFS[step].name}`
  );
  return report;
}

/** 例外を、画面に出せる日本語にする */
function describeError(e: unknown): string {
  if (e instanceof GenError) {
    console.error("[/api/generate]", e.message);
    return e.message;
  }
  console.error("[/api/generate] 生成に失敗しました", e);

  if (e instanceof Anthropic.AuthenticationError) {
    return "APIキーが無効です。ANTHROPIC_API_KEY を確認してください。";
  }
  if (e instanceof Anthropic.RateLimitError) {
    return "APIの利用が混み合っています。少し待って再試行してください。";
  }
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return "生成に時間がかかりすぎて接続が切れました。もう一度お試しください。";
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return "Anthropic API に接続できませんでした。ネットワーク設定を確認してください。";
  }
  if (e instanceof Anthropic.APIError) {
    const detail =
      (e.error as { error?: { message?: string } } | undefined)?.error?.message ??
      e.message;
    return `AI生成でエラーが発生しました (${e.status}): ${detail}`;
  }
  const message = e instanceof Error ? e.message : String(e);
  return `予期しないエラー: ${message}`;
}
