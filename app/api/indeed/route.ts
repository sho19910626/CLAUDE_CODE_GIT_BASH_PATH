// ヒアリング内容から Indeed 求人提案書を生成するルート。
//
// 生成は3段階に分ける。提案の全項目を1つのJSON Schemaに詰めると
// 構造化出力の文法をコンパイルできず 400 (compiled grammar is too large) になるため。
//   ① 戦略設計 → ② 掲載原稿 / ③ ビジュアル・運用(②③は①の結果を受けて並列実行)

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
  type IndeedProposal,
  type IndeedRequest,
  type JobPostStage,
  type StrategyStage,
  type VisualOpsStage,
} from "@/lib/indeed-types";

export const maxDuration = 600;

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

  let body: IndeedRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
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
  const imageBlocks = images
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
    .filter((b): b is NonNullable<typeof b> => b !== null);

  const hasImages = imageBlocks.length > 0;
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5";

  try {
    const client = new Anthropic();

    /** 1段階ぶんの構造化出力を取得する */
    const stage = async <T>(
      label: string,
      schema: unknown,
      prompt: string,
      withImages: boolean
    ): Promise<T> => {
      const response = await client.messages.create({
        model,
        max_tokens: 12000,
        thinking: { type: "adaptive" },
        system: INDEED_SYSTEM_PROMPT,
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
      });

      if (response.stop_reason === "refusal") {
        throw new StageError(
          `${label}の生成が拒否されました。入力内容を見直してください。`,
          422
        );
      }
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new StageError(`${label}の生成結果が空でした。再試行してください。`, 502);
      }
      return JSON.parse(textBlock.text) as T;
    };

    // ① 戦略設計。②③はこの結果に従って書かれる
    const strategy = await stage<StrategyStage>(
      "戦略設計",
      STRATEGY_SCHEMA,
      buildStrategyPrompt({ hearing, siteBlock, hasImages }),
      hasImages
    );
    if (!strategy.positioning?.reframe?.to) {
      throw new StageError("戦略設計の結果が不完全でした。もう一度お試しください。", 502);
    }

    // ②③ は互いに独立しているので並列に走らせる
    const [post, visualOps] = await Promise.all([
      stage<JobPostStage>(
        "掲載原稿",
        JOBPOST_SCHEMA,
        buildJobPostPrompt({ hearing, siteBlock, strategy }),
        false
      ),
      stage<VisualOpsStage>(
        "ビジュアル・運用設計",
        VISUAL_OPS_SCHEMA,
        buildVisualOpsPrompt({ hearing, siteBlock, hasImages, strategy }),
        hasImages
      ),
    ]);

    if (!post.jobPost?.body) {
      throw new StageError("掲載原稿が不完全でした。もう一度お試しください。", 502);
    }

    const proposal: IndeedProposal = { ...strategy, ...post, ...visualOps };
    return NextResponse.json({ proposal, siteFetched: site?.ok ?? false });
  } catch (e) {
    if (e instanceof StageError) {
      console.error("[/api/indeed]", e.message);
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    // 原因を切り分けられるよう、APIが返した内容をサーバーログにそのまま残す
    console.error("[/api/indeed] 生成に失敗しました", e);

    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "APIキーが無効です。ANTHROPIC_API_KEY を確認してください。" },
        { status: 500 }
      );
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "APIのレート制限に達しました。しばらく待って再試行してください。" },
        { status: 429 }
      );
    }
    if (e instanceof Anthropic.APIError) {
      const detail = apiErrorMessage(e);
      if (e.status === 404 || /model/i.test(detail)) {
        return NextResponse.json(
          {
            error:
              `モデル「${model}」を使えませんでした。.env に ANTHROPIC_MODEL=claude-opus-4-8 を追記すると別のモデルで動きます。(詳細: ${detail})`,
          },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { error: `AI生成でエラーが発生しました (${e.status}): ${detail}` },
        { status: 502 }
      );
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `予期しないエラー: ${message}` }, { status: 500 });
  }
}
