// ヒアリング内容から Indeed 求人提案書を生成するルート。
//
// 生成は3段階に分かれている。理由は2つ。
//  1. 提案の全項目を1つのJSON Schemaに詰めると、構造化出力の文法を
//     コンパイルできず 400 (compiled grammar is too large) になる
//  2. 1回のリクエストが数分に及ぶと、ブラウザ・中継サーバー・無料の
//     ホスティングの実行時間制限のいずれかに引っかかる
//
// そのため段階ごとに別のリクエストとして呼び出す。呼ぶ順番は画面側が持つ。
//   ① strategy → ② jobpost / ③ visual (②③は①の結果を受けて並列)
// 各段階の応答は NDJSON のストリームで、進捗と ping を流して接続を保つ。

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { fetchSiteInfo } from "@/lib/scrape";
import {
  JOBPOST_SCHEMA,
  STRATEGY_SCHEMA,
  VISUAL_OPS_SCHEMA,
} from "@/lib/indeed-schema";
import {
  INDEED_SYSTEM_PROMPT,
  buildJobPostPrompt,
  buildStrategyPrompt,
  buildVisualOpsPrompt,
} from "@/lib/indeed-prompt";
import {
  EMPLOYMENT_LABELS,
  type EmploymentType,
  type HearingSheet,
  type JobPostStage,
  type StageName,
  type StageRequest,
  type StrategyStage,
  type VisualOpsStage,
} from "@/lib/indeed-types";
import { currentUser } from "@/lib/indeed/server/auth";

// 1段階ぶんの上限。無料のホスティングでも収まる範囲にしている
export const maxDuration = 300;

type ImageBlock = {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    data: string;
  };
};

/** どの段階で失敗したかを画面に伝えるためのエラー */
class StageError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/** Anthropic の APIError から、画面に出せる原因テキストを取り出す */
function apiErrorMessage(e: InstanceType<typeof Anthropic.APIError>): string {
  const body = e.error as { error?: { message?: string } } | undefined;
  return body?.error?.message ?? e.message ?? "詳細不明";
}

const EMPTY_HEARING: HearingSheet = {
  employmentType: "parttime",
  url: "",
  companyName: "",
  business: "",
  position: "",
  workplace: "",
  salary: "",
  hours: "",
  holidays: "",
  benefits: "",
  requirements: "",
  selectionFlow: "",
  topPerformers: "",
  episode: "",
  mismatch: "",
  atmosphere: "",
  competitors: "",
  issues: "",
  currentAppeal: "",
  budget: "",
  memo: "",
};

const STAGE_LABEL: Record<StageName, string> = {
  strategy: "戦略設計",
  jobpost: "掲載原稿",
  visual: "ビジュアル・運用設計",
};

const STAGE_PROGRESS: Record<StageName, string> = {
  strategy: "現状を分析し、棲み分けを設計しています",
  jobpost: "掲載原稿を書いています",
  visual: "撮影指示と運用設計をまとめています",
};

export async function POST(req: NextRequest) {
  // middleware でもログインを見ているが、ここでも確かめる。
  // 除外設定を 1 行いじっただけで課金に直結するAPIが開くのを避けるため。
  if (!(await currentUser())) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "サーバーに ANTHROPIC_API_KEY が設定されていません。.env ファイルを確認してください。",
      },
      { status: 500 }
    );
  }

  let body: StageRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const stage = body.stage;
  if (!stage || !(stage in STAGE_LABEL)) {
    return NextResponse.json(
      { error: "画面を再読み込みしてから、もう一度お試しください。" },
      { status: 400 }
    );
  }

  const hearing: HearingSheet = { ...EMPTY_HEARING, ...(body.hearing ?? {}) };
  if (!(hearing.employmentType in EMPLOYMENT_LABELS)) {
    hearing.employmentType = "parttime" as EmploymentType;
  }

  // 棲み分けの設計には、最低限「何をしている会社の何の募集か」が要る
  if (!hearing.business.trim() && !hearing.position.trim() && !hearing.url.trim()) {
    return NextResponse.json(
      {
        error:
          "事業内容・募集職種・企業HPのURLのいずれかは入力してください(棲み分けの設計に最低限必要です)",
      },
      { status: 400 }
    );
  }

  // ②③ は①の結果を前提に書くため、無いと成立しない
  if (stage !== "strategy" && !body.strategy?.positioning?.reframe?.to) {
    return NextResponse.json(
      { error: "戦略の情報が渡っていません。最初からやり直してください。" },
      { status: 400 }
    );
  }

  const site = hearing.url.trim() ? await fetchSiteInfo(hearing.url.trim()) : null;
  const siteBlock = site?.ok
    ? [
        "## 企業HP・採用サイトの情報",
        `URL: ${site.url}`,
        `タイトル: ${site.title}`,
        site.description && `説明: ${site.description}`,
        "本文抜粋:",
        site.bodyText,
      ]
        .filter(Boolean)
        .join("\n")
    : site
      ? `## 企業HP\nURL: ${site.url}(取得できませんでした: ${site.error}。ヒアリング内容のみで判断してください)`
      : "";

  const images = Array.isArray(body.images) ? body.images : [];
  const imageBlocks: ImageBlock[] = images
    .slice(0, 3)
    .map((dataUrl) => {
      const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(dataUrl);
      if (!m) return null;
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: m[1] as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
          data: m[2],
        },
      };
    })
    .filter((b): b is ImageBlock => b !== null);

  const hasImages = imageBlocks.length > 0;
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5";

  // 生成中まったく通信が流れないと、ブラウザや中継サーバーが接続を切り、
  // 画面には "Failed to fetch" とだけ出る。進捗と ping を流し続けて防ぐ。
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
        send({ type: "progress", message: STAGE_PROGRESS[stage] });
        const data = await runStage({
          stage,
          model,
          hearing,
          siteBlock,
          imageBlocks,
          hasImages,
          strategy: body.strategy,
        });
        send({ type: "done", data });
      } catch (e) {
        send({ type: "error", error: describeError(e, model).error });
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
      // nginx 系のリバースプロキシに、途中で溜め込まず素通しさせる
      "X-Accel-Buffering": "no",
    },
  });
}

/** ストリームで流すイベント */
type StreamEvent =
  | { type: "ping" }
  | { type: "progress"; message: string }
  | { type: "done"; data: StrategyStage | JobPostStage | VisualOpsStage }
  | { type: "error"; error: string };

/** 指定された1段階だけを生成する */
async function runStage(args: {
  stage: StageName;
  model: string;
  hearing: HearingSheet;
  siteBlock: string;
  imageBlocks: ImageBlock[];
  hasImages: boolean;
  strategy?: StrategyStage;
}): Promise<StrategyStage | JobPostStage | VisualOpsStage> {
  const { stage, model, hearing, siteBlock, imageBlocks, hasImages } = args;

  // 1段階でも数分かかることがあるため、SDK 既定より長めのタイムアウトを取る
  const client = new Anthropic({ timeout: 15 * 60 * 1000, maxRetries: 2 });
  const label = STAGE_LABEL[stage];

  const plan = {
    strategy: {
      schema: STRATEGY_SCHEMA,
      prompt: () => buildStrategyPrompt({ hearing, siteBlock, hasImages }),
      withImages: true,
    },
    jobpost: {
      schema: JOBPOST_SCHEMA,
      prompt: () =>
        buildJobPostPrompt({ hearing, siteBlock, strategy: args.strategy! }),
      withImages: false,
    },
    visual: {
      schema: VISUAL_OPS_SCHEMA,
      prompt: () =>
        buildVisualOpsPrompt({
          hearing,
          siteBlock,
          hasImages,
          strategy: args.strategy!,
        }),
      withImages: true,
    },
  }[stage];

  // 拡張思考を伴う長い生成は、非ストリーミングだと接続が切れる。
  // ストリームで受け取り、完成したメッセージを組み立てる。
  const response = await client.messages
    .stream({
      model,
      max_tokens: 12000,
      thinking: { type: "adaptive" },
      system: INDEED_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...(plan.withImages ? imageBlocks : []),
            { type: "text" as const, text: plan.prompt() },
          ],
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: plan.schema as unknown as Record<string, unknown>,
        },
      },
    })
    .finalMessage();

  if (response.stop_reason === "refusal") {
    throw new StageError(
      `${label}の生成が拒否されました。入力内容を見直してください。`,
      422
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new StageError(
      `${label}の出力が長くなりすぎて途中で切れました。ヒアリング内容を少し減らして再試行してください。`,
      502
    );
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new StageError(`${label}の生成結果が空でした。再試行してください。`, 502);
  }

  let parsed: StrategyStage | JobPostStage | VisualOpsStage;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new StageError(
      `${label}の生成結果を読み取れませんでした。再試行してください。`,
      502
    );
  }

  const ok =
    stage === "strategy"
      ? !!(parsed as StrategyStage).positioning?.reframe?.to
      : stage === "jobpost"
        ? !!(parsed as JobPostStage).jobPost?.body
        : !!(parsed as VisualOpsStage).visual?.imagePrompt;
  if (!ok) {
    throw new StageError(`${label}の結果が不完全でした。もう一度お試しください。`, 502);
  }
  return parsed;
}

/** 例外を、画面に出せる日本語のメッセージに変換する */
function describeError(e: unknown, model: string): { error: string; status: number } {
  if (e instanceof StageError) {
    console.error("[/api/indeed]", e.message);
    return { error: e.message, status: e.status };
  }
  // 原因を切り分けられるよう、APIが返した内容をサーバーログにそのまま残す
  console.error("[/api/indeed] 生成に失敗しました", e);

  if (e instanceof Anthropic.AuthenticationError) {
    return {
      error: "APIキーが無効です。ANTHROPIC_API_KEY を確認してください。",
      status: 500,
    };
  }
  if (e instanceof Anthropic.RateLimitError) {
    return {
      error: "APIのレート制限に達しました。しばらく待って再試行してください。",
      status: 429,
    };
  }
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return {
      error:
        "生成に時間がかかりすぎて接続が切れました。ネットワークが不安定な場合に起きます。もう一度お試しください。",
      status: 504,
    };
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return {
      error:
        "Anthropic APIに接続できませんでした。ネットワーク接続やプロキシ設定を確認してください。",
      status: 502,
    };
  }
  if (e instanceof Anthropic.APIError) {
    const detail = apiErrorMessage(e);
    if (e.status === 404 || /model/i.test(detail)) {
      return {
        error: `モデル「${model}」を使えませんでした。ANTHROPIC_MODEL に claude-opus-4-8 などを設定すると別のモデルで動きます。(詳細: ${detail})`,
        status: 502,
      };
    }
    return {
      error: `AI生成でエラーが発生しました (${e.status}): ${detail}`,
      status: 502,
    };
  }
  const message = e instanceof Error ? e.message : String(e);
  return { error: `予期しないエラー: ${message}`, status: 500 };
}
