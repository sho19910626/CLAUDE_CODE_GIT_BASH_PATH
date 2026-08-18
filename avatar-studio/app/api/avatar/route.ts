// ヒアリング内容から「AIアバターSNS運用」の設計一式を生成するルート。
//
// 生成は5段階に分かれている。理由は Indeed 提案スタジオと同じで、
//  1. 全項目を1つのJSON Schemaに詰めると構造化出力の文法をコンパイルできない
//     (400: compiled grammar is too large)
//  2. 1回のリクエストが数分に及ぶと、ブラウザ・中継サーバー・ホスティングの
//     実行時間制限に引っかかる
//
// 呼ぶ順番は画面側が持つ。
//   ①a concept / ①b avatar (どちらもヒアリング内容だけから決まるので並列)
//   → ② scripts / ③ ops / ④ biz (①の結果を受けて並列)
// 各段階の応答は NDJSON のストリームで、進捗と ping を流して接続を保つ。

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { fetchSiteInfo } from "@/lib/scrape";
import {
  AVATAR_SPEC_SCHEMA,
  BIZ_SCHEMA,
  CONCEPT_SCHEMA,
  OPS_SCHEMA,
  SCRIPTS_SCHEMA,
} from "@/lib/avatar-schema";
import {
  AVATAR_SYSTEM_PROMPT,
  buildAvatarPrompt,
  buildBizPrompt,
  buildConceptPrompt,
  buildOpsPrompt,
  buildScriptsPrompt,
} from "@/lib/avatar-prompt";
import {
  FACE_LEVEL_LABELS,
  GOAL_LABELS,
  PLATFORM_LABELS,
  type AvatarBrief,
  type AvatarDesign,
  type AvatarGoal,
  type AvatarSpecStage,
  type AvatarStageName,
  type AvatarStageRequest,
  type BizStage,
  type ConceptStage,
  type FaceLevel,
  type OpsStage,
  type Platform,
  type ScriptsStage,
} from "@/lib/avatar-types";

// 1段階ぶんの上限。無料のホスティングでも収まる範囲にしている
export const maxDuration = 300;

type StageResult =
  | ConceptStage
  | AvatarSpecStage
  | ScriptsStage
  | OpsStage
  | BizStage;

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

const EMPTY_BRIEF: AvatarBrief = {
  goal: "sales",
  platform: "tiktok",
  faceLevel: "twin",
  url: "",
  companyName: "",
  business: "",
  speaker: "",
  speakerVoice: "",
  lookRequest: "",
  product: "",
  target: "",
  faq: "",
  proof: "",
  competitors: "",
  history: "",
  ngList: "",
  assets: "",
  operation: "",
  budget: "",
  memo: "",
};

const STAGE_LABEL: Record<AvatarStageName, string> = {
  concept: "発信の型",
  avatar: "アバターの設定",
  scripts: "台本",
  ops: "量産オペレーション",
  biz: "収益設計",
};

const STAGE_PROGRESS: Record<AvatarStageName, string> = {
  concept: "誰に何を届けるアカウントにするかを決めています",
  avatar: "アバターの見た目・声・話し方を決めています",
  scripts: "完成台本を書いています",
  ops: "制作フローと投稿カレンダーを組んでいます",
  biz: "料金プランと契約設計をまとめています",
};

/** 台本は他の段階より長い。段階ごとに上限を変える */
const STAGE_MAX_TOKENS: Record<AvatarStageName, number> = {
  concept: 12000,
  avatar: 12000,
  scripts: 16000,
  ops: 12000,
  biz: 12000,
};

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "サーバーに ANTHROPIC_API_KEY が設定されていません。.env ファイルを確認してください。",
      },
      { status: 500 }
    );
  }

  let body: AvatarStageRequest;
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

  const brief: AvatarBrief = { ...EMPTY_BRIEF, ...(body.brief ?? {}) };
  if (!(brief.goal in GOAL_LABELS)) brief.goal = "sales" as AvatarGoal;
  if (!(brief.platform in PLATFORM_LABELS)) brief.platform = "tiktok" as Platform;
  if (!(brief.faceLevel in FACE_LEVEL_LABELS)) brief.faceLevel = "twin" as FaceLevel;

  // 誰が何を売っているのかが分からないと、台本のネタが一つも出せない
  if (!brief.business.trim() && !brief.product.trim() && !brief.url.trim()) {
    return NextResponse.json(
      {
        error:
          "事業内容・商材・サイトURLのいずれかは入力してください(発信するネタの起点に必要です)",
      },
      { status: 400 }
    );
  }

  // ②③④ は①の設計を前提に書くため、無いと成立しない
  const needsDesign = stage !== "concept" && stage !== "avatar";
  if (needsDesign && !(body.design?.avatar?.name && body.design?.summary?.accountName)) {
    return NextResponse.json(
      { error: "アバター設計の情報が渡っていません。最初からやり直してください。" },
      { status: 400 }
    );
  }

  const site = brief.url.trim() ? await fetchSiteInfo(brief.url.trim()) : null;
  const siteBlock = site?.ok
    ? [
        "## 企業HP・サービスサイトの情報",
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
          brief,
          siteBlock,
          imageBlocks,
          hasImages: imageBlocks.length > 0,
          design: body.design,
          avoidThemes: body.avoidThemes,
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
  | { type: "done"; data: StageResult }
  | { type: "error"; error: string };

/** 指定された1段階だけを生成する */
async function runStage(args: {
  stage: AvatarStageName;
  model: string;
  brief: AvatarBrief;
  siteBlock: string;
  imageBlocks: ImageBlock[];
  hasImages: boolean;
  design?: AvatarDesign;
  avoidThemes?: string[];
}): Promise<StageResult> {
  const { stage, model, brief, siteBlock, imageBlocks, hasImages } = args;

  // 1段階でも数分かかることがあるため、SDK 既定より長めのタイムアウトを取る
  const client = new Anthropic({ timeout: 15 * 60 * 1000, maxRetries: 2 });
  const label = STAGE_LABEL[stage];

  const plan = {
    concept: {
      schema: CONCEPT_SCHEMA,
      prompt: () => buildConceptPrompt({ brief, siteBlock, hasImages }),
      withImages: true,
    },
    avatar: {
      schema: AVATAR_SPEC_SCHEMA,
      prompt: () => buildAvatarPrompt({ brief, siteBlock, hasImages }),
      withImages: true,
    },
    scripts: {
      schema: SCRIPTS_SCHEMA,
      prompt: () =>
        buildScriptsPrompt({
          brief,
          siteBlock,
          design: args.design!,
          avoidThemes: args.avoidThemes,
        }),
      withImages: false,
    },
    ops: {
      schema: OPS_SCHEMA,
      prompt: () => buildOpsPrompt({ brief, siteBlock, design: args.design! }),
      withImages: false,
    },
    biz: {
      schema: BIZ_SCHEMA,
      prompt: () => buildBizPrompt({ brief, siteBlock, design: args.design! }),
      withImages: false,
    },
  }[stage];

  // 拡張思考を伴う長い生成は、非ストリーミングだと接続が切れる。
  // ストリームで受け取り、完成したメッセージを組み立てる。
  const response = await client.messages
    .stream({
      model,
      max_tokens: STAGE_MAX_TOKENS[stage],
      thinking: { type: "adaptive" },
      system: AVATAR_SYSTEM_PROMPT,
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

  let parsed: StageResult;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new StageError(
      `${label}の生成結果を読み取れませんでした。再試行してください。`,
      502
    );
  }

  const ok =
    stage === "concept"
      ? !!(parsed as ConceptStage).summary?.accountName
      : stage === "avatar"
        ? !!(parsed as AvatarSpecStage).avatar?.name
        : stage === "scripts"
          ? ((parsed as ScriptsStage).scripts?.length ?? 0) > 0
          : stage === "ops"
            ? ((parsed as OpsStage).production?.workflow?.length ?? 0) > 0
            : !!(parsed as BizStage).offer?.plans?.length;
  if (!ok) {
    throw new StageError(`${label}の結果が不完全でした。もう一度お試しください。`, 502);
  }
  return parsed;
}

/** 例外を、画面に出せる日本語のメッセージに変換する */
function describeError(e: unknown, model: string): { error: string; status: number } {
  if (e instanceof StageError) {
    console.error("[/api/avatar]", e.message);
    return { error: e.message, status: e.status };
  }
  // 原因を切り分けられるよう、APIが返した内容をサーバーログにそのまま残す
  console.error("[/api/avatar] 生成に失敗しました", e);

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
