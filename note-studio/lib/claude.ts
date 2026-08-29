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

/**
 * 構造化出力が受け付けないスキーマの指定を取り除く。
 *
 * 公式の制限:
 *   - 配列の件数指定(minItems / maxItems など)
 *   - 数値の範囲(minimum / maximum / multipleOf)
 *   - 文字数(minLength / maxLength)
 *   - 再帰するスキーマ
 * これらを付けたまま送ると 400 で弾かれる。
 *
 * ⚠ 件数や長さの指定を消しても要件は消えない。
 *   「3〜5個」のような指定は、プロンプト本文で必ず言うこと。
 *   スキーマ側は自己文書化のために書いたままにして、送る直前にここで落とす。
 */
const UNSUPPORTED_SCHEMA_KEYS = new Set([
  "minItems",
  "maxItems",
  "uniqueItems",
  "contains",
  "minContains",
  "maxContains",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "minProperties",
  "maxProperties",
]);

export function sanitizeSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeSchema);
  if (node === null || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
    out[key] = sanitizeSchema(value);
  }
  return out;
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

    // ストリーミングで受け取る。
    //
    // 記事や運用計画は出力が長く、まとめて受け取る書き方だと SDK に
    // 「10分を超える可能性がある処理は streaming が必要」と断られる。
    // 途中経過は使わないが、finalMessage() で完成品だけ受け取れるので、
    // 呼び出し側の書き方は変わらない。
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: args.maxTokens ?? 16000,
      thinking: { type: "adaptive" },
      system: args.system,
      messages: [{ role: "user", content: args.prompt }],
      output_config: {
        format: {
          type: "json_schema",
          schema: sanitizeSchema(args.schema) as Record<string, unknown>,
        },
      },
    });
    const response = await stream.finalMessage();

    if (response.stop_reason === "refusal") {
      throw new GenerationError(
        "この内容では生成できませんでした。入力を見直してください。",
        422
      );
    }

    if (response.stop_reason === "max_tokens") {
      // 途中で切れた JSON をそのまま parse すると意味不明なエラーになる。
      // 何が起きたかを利用者に分かる言葉で返す。
      throw new GenerationError(
        "生成が長くなりすぎて途中で切れました。指示を短くするか、分けて生成してください。",
        502
      );
    }

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      throw new GenerationError("生成結果が空でした。もう一度お試しください。", 502);
    }

    try {
      return JSON.parse(block.text) as T;
    } catch {
      throw new GenerationError(
        "AI の返事が読み取れませんでした。もう一度お試しください。",
        502
      );
    }
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
    if (e instanceof Anthropic.BadRequestError) {
      // 400 は「送った内容が不正」。API が理由を文章で返してくれるので、
      // それを必ず画面まで届ける。番号だけ出しても直しようがない。
      throw new GenerationError(
        `AI への送信内容に問題がありました。${e.message}`,
        502
      );
    }
    if (e instanceof Anthropic.APIError) {
      throw new GenerationError(
        `AI 生成でエラーが起きました (${e.status})。${e.message}`,
        502
      );
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
