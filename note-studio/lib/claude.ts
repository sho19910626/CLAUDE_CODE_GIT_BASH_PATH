// AI呼び出しの共通部分。
//
// 6つの工程がすべて「決まった形の JSON を返させる」ので、
// スキーマ付きの呼び出しを 1 か所にまとめる。
// エラー文言も揃える(利用者は AI の事情を知らないため、次にすることを書く)。

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

export class GenerationError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function generateJson<T>(args: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new GenerationError(
      "ANTHROPIC_API_KEY が設定されていません。.env に入れてから、もう一度お試しください。",
      503
    );
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: args.maxTokens ?? 16000,
      thinking: { type: "adaptive" },
      system: args.system,
      messages: [{ role: "user", content: args.prompt }],
      output_config: {
        format: { type: "json_schema", schema: args.schema },
      },
    });

    if (response.stop_reason === "refusal") {
      throw new GenerationError(
        "この内容では生成できませんでした。入力を見直してください。",
        422
      );
    }

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      throw new GenerationError("生成結果が空でした。もう一度お試しください。", 502);
    }
    return JSON.parse(block.text) as T;
  } catch (e) {
    if (e instanceof GenerationError) throw e;
    if (e instanceof Anthropic.AuthenticationError) {
      throw new GenerationError(
        "APIキーが無効です。ANTHROPIC_API_KEY を確認してください。",
        500
      );
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new GenerationError(
        "AI の利用が混み合っています。1〜2分待ってからもう一度お試しください。",
        429
      );
    }
    if (e instanceof Anthropic.APIError) {
      throw new GenerationError(`AI 生成でエラーが起きました (${e.status})`, 502);
    }
    const message = e instanceof Error ? e.message : String(e);
    throw new GenerationError(`予期しないエラー: ${message}`, 500);
  }
}

/** JSON スキーマを組み立てる小道具。additionalProperties:false と required を必ず付ける */
export function obj(
  properties: Record<string, unknown>,
  opts: { required?: string[] } = {}
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required: opts.required ?? Object.keys(properties),
    additionalProperties: false,
  };
}

export function arr(items: unknown, opts: { min?: number; max?: number } = {}) {
  return {
    type: "array",
    items,
    ...(opts.min !== undefined ? { minItems: opts.min } : {}),
    ...(opts.max !== undefined ? { maxItems: opts.max } : {}),
  };
}

export const S = { type: "string" } as const;
export const N = { type: "number" } as const;
export const B = { type: "boolean" } as const;

export function enumOf(...values: string[]) {
  return { type: "string", enum: values };
}
