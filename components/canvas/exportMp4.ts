// WebCodecs によるフレーム正確な MP4 (H.264) 書き出し。
// リアルタイム録画と違いフレーム落ちがなく、Instagramへそのまま投稿できる。

import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { REEL_H, REEL_W, ReelPlayer } from "./reel";

const FPS = 30;
const BITRATE = 12_000_000;

const ENCODER_CONFIG: VideoEncoderConfig = {
  codec: "avc1.640028", // H.264 High Profile Level 4.0 (1080x1920@30fps)
  width: REEL_W,
  height: REEL_H,
  bitrate: BITRATE,
  framerate: FPS,
};

/**
 * このブラウザで H.264/MP4 書き出しが使えるか。
 * WebCodecs があってもコーデック未搭載のビルドがあるため isConfigSupported まで確認する。
 */
export async function supportsMp4Export(): Promise<boolean> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
    return false;
  }
  try {
    const { supported } = await VideoEncoder.isConfigSupported(ENCODER_CONFIG);
    return supported === true;
  } catch {
    return false;
  }
}

/**
 * リールを1フレームずつ描画して MP4 にエンコードする。
 * 背景動画がある場合はフレームごとにシークして正確に合成する。
 */
export async function exportReelMp4(
  player: ReelPlayer,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  player.stop();

  const totalFrames = Math.round((player.durationMs / 1000) * FPS);
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: REEL_W, height: REEL_H },
    fastStart: "in-memory",
  });

  let encodeError: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e;
    },
  });
  encoder.configure(ENCODER_CONFIG);

  const video = player.backgroundVideo;
  if (video) video.pause();

  for (let i = 0; i < totalFrames; i++) {
    if (encodeError) throw toError(encodeError);
    const tMs = (i * 1000) / FPS;

    if (video && video.duration && isFinite(video.duration)) {
      await seekVideo(video, (tMs / 1000) % video.duration);
    }

    player.drawFrame(tMs);

    const frame = new VideoFrame(player.canvasEl, {
      timestamp: Math.round((i * 1e6) / FPS),
      duration: Math.round(1e6 / FPS),
    });
    encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();

    // エンコーダのキューが詰まりすぎないように待つ
    while (encoder.encodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 4));
    }
    onProgress?.(i / totalFrames);
  }

  await encoder.flush();
  if (encodeError) throw toError(encodeError);
  encoder.close();
  muxer.finalize();
  onProgress?.(1);

  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}

function seekVideo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 1 / 120) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", finish);
      resolve();
    };
    video.addEventListener("seeked", finish, { once: true });
    video.currentTime = t;
    // シークイベントが来ない環境向けの保険
    setTimeout(finish, 600);
  });
}

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}
