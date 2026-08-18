// AIナレーション生成 (OpenAI Text-to-Speech)。
//
// 元動画の音声を使わず、台本を読み上げさせるモード用。
// カットごとに音声ファイルを作り、その長さに合わせて映像の尺を決める。

import { promises as fs } from "node:fs";

const DEFAULT_MODEL = "gpt-4o-mini-tts";
const DEFAULT_VOICE = "alloy";

/** 企業PR動画のナレーションとして自然に聞こえるトーン指示 */
const VOICE_INSTRUCTIONS =
  "日本語の企業紹介ビデオのナレーションとして読み上げてください。" +
  "落ち着いた信頼感のある声で、はっきりと、少しゆっくりめに。" +
  "感情を過剰に込めず、句読点で自然な間を取り、語尾を丁寧に締めてください。";

/** ナレーション音声を1本生成して mp3 で保存する */
export async function synthesizeNarration(
  text: string,
  outPath: string,
  apiKey: string,
  opts: { voice?: string; speed?: number; signal?: AbortSignal } = {}
): Promise<void> {
  const body: Record<string, unknown> = {
    model: process.env.OPENAI_TTS_MODEL || DEFAULT_MODEL,
    voice: opts.voice || process.env.OPENAI_TTS_VOICE || DEFAULT_VOICE,
    input: text,
    response_format: "mp3",
    instructions: VOICE_INSTRUCTIONS,
  };
  if (opts.speed) body.speed = opts.speed;

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error("OpenAI の APIキーが無効です。OPENAI_API_KEY を確認してください。");
    }
    throw new Error(`ナレーション生成に失敗しました (${res.status}) ${detail.slice(0, 300)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outPath, buf);
}
