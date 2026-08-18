// 素材動画のメタ情報取得。尺・解像度・音声の有無で編集方針が変わる。

import { execCapture, ffprobePath } from "./ffmpeg";

export interface MediaMeta {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

interface ProbeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  duration?: string;
}

interface ProbeResult {
  streams?: ProbeStream[];
  format?: { duration?: string };
}

function parseFps(rate: string | undefined): number {
  if (!rate) return 30;
  const [num, den] = rate.split("/").map(Number);
  if (!num || !den) return 30;
  const fps = num / den;
  return Number.isFinite(fps) && fps > 0 && fps < 240 ? fps : 30;
}

/** 動画・音声ファイルのメタ情報を読む */
export async function probeMedia(filePath: string): Promise<MediaMeta> {
  const raw = await execCapture(ffprobePath(), [
    // quiet にすると失敗理由が一切残らないため error は出させる
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);

  let data: ProbeResult;
  try {
    data = JSON.parse(raw) as ProbeResult;
  } catch {
    throw new Error("動画の情報を読み取れませんでした。対応していない形式の可能性があります。");
  }

  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");

  const duration = Number(data.format?.duration ?? video?.duration ?? audio?.duration ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("動画の長さを判定できませんでした。ファイルが壊れていないか確認してください。");
  }

  return {
    durationSec: duration,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: parseFps(video?.r_frame_rate),
    hasAudio: Boolean(audio),
    hasVideo: Boolean(video),
  };
}
