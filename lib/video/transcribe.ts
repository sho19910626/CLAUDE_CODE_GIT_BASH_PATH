// 素材動画の文字起こし。
//
// 「どこで何を話しているか」が分からないと編集の判断ができないため、
// 秒単位のタイムスタンプ付きで書き起こす。編集台本(EDL)の入力になる。

import { promises as fs } from "node:fs";
import path from "node:path";
import { runFfmpeg } from "./ffmpeg";

export interface TranscriptSegment {
  /** 素材の先頭からの秒数 */
  start: number;
  end: number;
  text: string;
}

/** Whisper の 25MB 制限に収めるため、長い素材はこの秒数で分割する */
const CHUNK_SEC = 900;
/** 音声のみ・モノラル・32kbps に落とすと 1 分あたり約 0.24MB */
const ASR_BITRATE = "32k";

const DEFAULT_MODEL = "whisper-1";

interface WhisperResponse {
  text?: string;
  segments?: { start?: number; end?: number; text?: string }[];
}

/** 動画から文字起こし用の軽い音声を抜き出す */
async function extractAudio(
  videoPath: string,
  outPath: string,
  startSec?: number,
  durationSec?: number
): Promise<void> {
  const args: string[] = [];
  if (startSec !== undefined) args.push("-ss", String(startSec));
  args.push("-i", videoPath);
  if (durationSec !== undefined) args.push("-t", String(durationSec));
  args.push("-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", ASR_BITRATE, outPath);
  await runFfmpeg(args);
}

async function callWhisper(
  filePath: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<WhisperResponse> {
  const buf = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: "audio/mpeg" }), path.basename(filePath));
  form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_MODEL);
  form.append("language", "ja");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error("OpenAI の APIキーが無効です。OPENAI_API_KEY を確認してください。");
    }
    if (res.status === 429) {
      throw new Error("OpenAI のレート制限に達しました。しばらく待って再試行してください。");
    }
    throw new Error(`文字起こしに失敗しました (${res.status}) ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as WhisperResponse;
}

/**
 * 動画を文字起こしする。長尺は分割して呼び、タイムスタンプを繋ぎ直す。
 * 音声トラックが無い素材では空配列を返す(画面録画などは無音のことがある)。
 */
export async function transcribeVideo(
  videoPath: string,
  durationSec: number,
  workDir: string,
  apiKey: string,
  opts: { onProgress?: (ratio: number) => void; signal?: AbortSignal } = {}
): Promise<TranscriptSegment[]> {
  const chunks = Math.max(1, Math.ceil(durationSec / CHUNK_SEC));
  const segments: TranscriptSegment[] = [];

  for (let i = 0; i < chunks; i++) {
    const offset = i * CHUNK_SEC;
    const length = Math.min(CHUNK_SEC, durationSec - offset);
    if (length <= 0.2) break;

    const audioPath = path.join(workDir, `asr-${i}.mp3`);
    await extractAudio(videoPath, audioPath, chunks > 1 ? offset : undefined, chunks > 1 ? length : undefined);

    const result = await callWhisper(audioPath, apiKey, opts.signal);
    for (const s of result.segments ?? []) {
      const text = (s.text ?? "").trim();
      if (!text) continue;
      segments.push({
        start: Math.max(0, (s.start ?? 0) + offset),
        end: Math.max(0, (s.end ?? 0) + offset),
        text,
      });
    }
    await fs.rm(audioPath, { force: true });
    opts.onProgress?.((i + 1) / chunks);
  }

  return segments;
}

/** AI に渡す用に「[開始秒-終了秒] 発言」の形へ整形する */
export function formatTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join("\n");
}
