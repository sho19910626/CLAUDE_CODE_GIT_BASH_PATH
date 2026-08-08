// ヒアリング内容から Indeed 求人提案書を生成するルート。

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { fetchSiteInfo } from "@/lib/scrape";
import { INDEED_PROPOSAL_SCHEMA } from "@/lib/indeed-schema";
import {
  INDEED_SYSTEM_PROMPT,
  buildIndeedUserPrompt,
} from "@/lib/indeed-prompt";
import {
  EMPLOYMENT_LABELS,
  type EmploymentType,
  type HearingSheet,
  type IndeedProposal,
  type IndeedRequest,
} from "@/lib/indeed-types";

export const maxDuration = 300;

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

  const userPrompt = buildIndeedUserPrompt({
    hearing,
    siteBlock,
    hasImages: imageBlocks.length > 0,
  });

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
      max_tokens: 20000,
      thinking: { type: "adaptive" },
      system: INDEED_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [...imageBlocks, { type: "text" as const, text: userPrompt }],
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: INDEED_PROPOSAL_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "この内容では提案を生成できませんでした。入力内容を見直してください。" },
        { status: 422 }
      );
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "生成結果が空でした。再試行してください。" },
        { status: 502 }
      );
    }

    const proposal: IndeedProposal = JSON.parse(textBlock.text);
    if (!proposal.positioning || !proposal.jobPost?.body) {
      return NextResponse.json(
        { error: "生成結果が不完全でした。もう一度お試しください。" },
        { status: 502 }
      );
    }

    return NextResponse.json({ proposal, siteFetched: site?.ok ?? false });
  } catch (e) {
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
      return NextResponse.json(
        { error: `AI生成でエラーが発生しました (${e.status})` },
        { status: 502 }
      );
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `予期しないエラー: ${message}` }, { status: 500 });
  }
}
