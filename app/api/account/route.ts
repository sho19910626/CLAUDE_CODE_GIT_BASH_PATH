// Instagram採用アカウント一式を生成するルート。
//
// 納品物が大きい(9投稿のカルーセル+ハイライト12枚+リール3本)ため、
// 1回のリクエストでは構造化出力の文法をコンパイルできず、実行時間制限にも
// かかる。そこで段階を分け、画面側が順に呼び出す。
//
//   ① foundation … ブランド・プロフィール・9枚のグリッド設計
//      ↓ (①の結果を渡して、以降は並列で呼べる)
//   ② posts-a / posts-b / posts-c … 各3投稿の中面
//   ③ highlights … ハイライト3種×4枚
//   ④ reels … リール3本
//
// 各段階の応答は NDJSON。生成中に通信が途切れないよう ping を流し続ける。

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { fetchSiteInfo } from "@/lib/scrape";
import {
  FOUNDATION_SCHEMA,
  HIGHLIGHTS_SCHEMA,
  POSTS_SCHEMA,
  REELS_SCHEMA,
} from "@/lib/account-schema";
import {
  ACCOUNT_SYSTEM_PROMPT,
  buildFoundationPrompt,
  buildHighlightsPrompt,
  buildPostsPrompt,
  buildReelsPrompt,
} from "@/lib/account-prompt";
import {
  DEFAULT_HIGHLIGHTS,
  DEFAULT_REELS,
  DEFAULT_SLOTS,
  EMPTY_BRIEF,
  POST_STAGE_SLOTS,
  type AccountBrief,
  type AccountStageName,
  type AccountStageRequest,
  type FoundationStage,
  type HighlightsStage,
  type PostsStage,
  type ReelsStage,
} from "@/lib/account-types";
import { currentUser } from "@/lib/auth";

export const maxDuration = 300;

type ImageBlock = {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    data: string;
  };
};

const STAGE_PROGRESS: Record<AccountStageName, string> = {
  foundation: "ブランド設計とグリッド全体の構成を組み立てています",
  "posts-a": "ピン止め3投稿(会社紹介・社員紹介・応募方法)を書いています",
  "posts-b": "2段目の3投稿を書いています",
  "posts-c": "3段目の3投稿を書いています",
  highlights: "ハイライト3種を書いています",
  reels: "リール3本の構成を書いています",
};

type StageEvent =
  | { type: "ping" }
  | { type: "progress"; message: string }
  | { type: "done"; data: FoundationStage | PostsStage | HighlightsStage | ReelsStage }
  | { type: "error"; error: string };

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

  let body: AccountStageRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const stage = body.stage;
  if (!stage || !(stage in STAGE_PROGRESS)) {
    return NextResponse.json(
      { error: "画面を再読み込みしてから、もう一度お試しください。" },
      { status: 400 }
    );
  }

  const brief: AccountBrief = { ...EMPTY_BRIEF, ...(body.brief ?? {}) };
  if (!brief.business.trim() && !brief.url.trim() && !brief.companyName.trim()) {
    return NextResponse.json(
      { error: "企業名・事業内容・企業HPのURLのいずれかは入力してください" },
      { status: 400 }
    );
  }

  // ②以降は①の結果が要る
  if (stage !== "foundation" && !body.foundation?.posts?.length) {
    return NextResponse.json(
      { error: "土台の設計結果が渡っていません。最初からやり直してください。" },
      { status: 400 }
    );
  }

  const slots = body.slots?.length ? body.slots : DEFAULT_SLOTS;
  const highlightSpecs = body.highlightSpecs?.length ? body.highlightSpecs : DEFAULT_HIGHLIGHTS;
  const reelSpecs = body.reelSpecs?.length ? body.reelSpecs : DEFAULT_REELS;

  const site = brief.url.trim() ? await fetchSiteInfo(brief.url.trim()) : null;
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

  const imageBlocks: ImageBlock[] = (Array.isArray(body.images) ? body.images : [])
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
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: StageEvent) => {
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
          slots,
          highlightSpecs,
          reelSpecs,
          foundation: body.foundation,
        });
        send({ type: "done", data });
      } catch (e) {
        send({ type: "error", error: describeError(e, model) });
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

async function runStage(args: {
  stage: AccountStageName;
  model: string;
  brief: AccountBrief;
  siteBlock: string;
  imageBlocks: ImageBlock[];
  slots: AccountStageRequest["slots"];
  highlightSpecs: AccountStageRequest["highlightSpecs"];
  reelSpecs: AccountStageRequest["reelSpecs"];
  foundation?: FoundationStage;
}) {
  const { stage, model, brief, siteBlock, imageBlocks, slots, highlightSpecs, reelSpecs } = args;
  const hasImages = imageBlocks.length > 0;

  // 1段階でも数分かかるため、SDK既定より長いタイムアウトを取る
  const client = new Anthropic({ timeout: 15 * 60 * 1000, maxRetries: 2 });

  let schema: unknown;
  let prompt: string;
  let withImages = false;

  if (stage === "foundation") {
    schema = FOUNDATION_SCHEMA;
    prompt = buildFoundationPrompt({ brief, siteBlock, slots, highlightSpecs, reelSpecs, hasImages });
    withImages = true;
  } else if (stage === "highlights") {
    schema = HIGHLIGHTS_SCHEMA;
    prompt = buildHighlightsPrompt({
      brief,
      siteBlock,
      foundation: args.foundation!,
      highlightSpecs,
    });
  } else if (stage === "reels") {
    schema = REELS_SCHEMA;
    prompt = buildReelsPrompt({ brief, siteBlock, foundation: args.foundation!, reelSpecs });
  } else {
    schema = POSTS_SCHEMA;
    prompt = buildPostsPrompt({
      brief,
      siteBlock,
      foundation: args.foundation!,
      slots,
      targetSlots: POST_STAGE_SLOTS[stage] ?? [],
    });
  }

  // 拡張思考を伴う長い生成は非ストリーミングだと接続が切れるため、ストリームで受ける
  const response = await client.messages
    .stream({
      model,
      max_tokens: 14000,
      thinking: { type: "adaptive" },
      system: ACCOUNT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...(withImages ? imageBlocks : []),
            { type: "text" as const, text: prompt },
          ],
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: schema as Record<string, unknown>,
        },
      },
    })
    .finalMessage();

  if (response.stop_reason === "refusal") {
    throw new Error("この内容ではコンテンツを生成できませんでした。入力内容を見直してください。");
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("生成結果が空でした。もう一度お試しください。");
  }
  return JSON.parse(textBlock.text);
}

function describeError(e: unknown, model: string): string {
  if (e instanceof Anthropic.AuthenticationError) {
    return "APIキーが無効です。ANTHROPIC_API_KEY を確認してください。";
  }
  if (e instanceof Anthropic.RateLimitError) {
    return "APIのレート制限に達しました。1分ほど待ってから、もう一度お試しください。";
  }
  if (e instanceof Anthropic.APIError) {
    const bodyErr = e.error as { error?: { message?: string } } | undefined;
    const detail = bodyErr?.error?.message ?? e.message ?? "詳細不明";
    if (e.status === 404) {
      return `モデル「${model}」を利用できません。.env の ANTHROPIC_MODEL を確認してください。(${detail})`;
    }
    return `AI生成でエラーが発生しました (${e.status}): ${detail}`;
  }
  return e instanceof Error ? e.message : String(e);
}
